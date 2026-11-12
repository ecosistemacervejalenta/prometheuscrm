import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Chamadas à API do Mercado Pago — Checkout Transparente pela API de Orders (a de Payments
 * será descontinuada). Um PIX = uma order com um pagamento pix (bank_transfer).
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix
 */

const API = 'https://api.mercadopago.com'

export type ContaMercadoPago = { id: string; nome: string | null; email: string | null }

/**
 * Order já traduzida para o vocabulário que o banco entende (registrar_status_pix):
 * approved | pending | cancelled | rejected | refunded | charged_back.
 */
export type PixMercadoPago = {
  id: string
  status: string
  statusDetalhe: string | null
  valor: number
  aprovadoEm: string | null
  referencia: string | null
  copiaECola: string | null
  qrCodeBase64: string | null
  linkMp: string | null
}

export class ErroMercadoPago extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem)
  }
}

type CorpoOrder = {
  id: string
  status?: string
  status_detail?: string | null
  total_amount?: string
  total_paid_amount?: string | null
  external_reference?: string | null
  last_updated_date?: string | null
  transactions?: {
    payments?: Array<{
      id?: string
      status?: string
      status_detail?: string
      paid_amount?: string | null
      payment_method?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string }
    }>
  }
}

type CorpoErro = { message?: string; errors?: Array<{ message?: string; details?: string[] }>; cause?: Array<{ description?: string }> }

async function chamar<T>(token: string, caminho: string, init?: RequestInit & { idempotencia?: string }): Promise<T> {
  const resposta = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.idempotencia ? { 'X-Idempotency-Key': init.idempotencia } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const corpo = (await resposta.json().catch(() => null)) as (T & CorpoErro) | null
  if (!resposta.ok || !corpo) {
    const motivo =
      corpo?.errors?.[0]?.details?.[0] || corpo?.errors?.[0]?.message || corpo?.cause?.[0]?.description || corpo?.message || `HTTP ${resposta.status}`
    throw new ErroMercadoPago(traduzirErro(resposta.status, motivo), resposta.status)
  }
  return corpo
}

function traduzirErro(status: number, motivo: string): string {
  if (status === 401) return 'O Mercado Pago recusou o Access Token (inválido ou revogado). Gere um novo em Suas integrações › Credenciais de produção.'
  if (status === 403) return `O Mercado Pago bloqueou a operação nesta conta: ${motivo}. Confira se a conta tem chave PIX cadastrada.`
  return `Mercado Pago: ${motivo}`
}

/** Status da order → vocabulário do banco (ver tabela "Status da order" na documentação). */
function statusDoBanco(status: string, detalhe: string | null): string {
  switch (status) {
    case 'processed':
      return 'approved' // accredited (ou partially_refunded: o PIX entrou)
    case 'refunded':
      return 'refunded'
    case 'charged_back':
      return 'charged_back'
    case 'canceled':
      return 'cancelled' // canceled | expired
    case 'failed':
      return detalhe === 'expired' ? 'cancelled' : 'rejected'
    default:
      return 'pending' // created | processing | action_required (waiting_transfer...)
  }
}

function converterOrder(o: CorpoOrder): PixMercadoPago {
  const pagamento = o.transactions?.payments?.[0]
  const metodo = pagamento?.payment_method
  const status = o.status ?? 'created'
  const detalhe = o.status_detail ?? pagamento?.status_detail ?? null
  return {
    id: o.id,
    status: statusDoBanco(status, detalhe),
    statusDetalhe: [status, detalhe].filter(Boolean).join('/'),
    valor: Number(o.total_paid_amount || pagamento?.paid_amount || o.total_amount || 0),
    aprovadoEm: status === 'processed' ? (o.last_updated_date ?? null) : null,
    referencia: o.external_reference ?? null,
    copiaECola: metodo?.qr_code ?? null,
    qrCodeBase64: metodo?.qr_code_base64 ?? null,
    linkMp: metodo?.ticket_url ?? null,
  }
}

/** Confere o token e devolve a conta dona dele. */
export async function consultarConta(token: string): Promise<ContaMercadoPago> {
  const eu = await chamar<{ id: number; nickname?: string; email?: string; first_name?: string; last_name?: string }>(token, '/users/me')
  const nomePessoa = [eu.first_name, eu.last_name].filter(Boolean).join(' ')
  return { id: String(eu.id), nome: eu.nickname || nomePessoa || null, email: eu.email ?? null }
}

const valorMercadoPago = (valor: number) => (Math.round(valor * 100) / 100).toFixed(2)

/**
 * Cria a order PIX. Sem expiration_time: o PIX vale o padrão do Mercado Pago (24 h),
 * igual à validade gravada na cobrança.
 */
export async function criarOrderPix(
  token: string,
  dados: { cobrancaId: string; valor: number; email: string },
): Promise<PixMercadoPago> {
  const valor = valorMercadoPago(dados.valor)
  const corpo = await chamar<CorpoOrder>(token, '/v1/orders', {
    method: 'POST',
    // Mesma chave = mesma order: repetir a chamada nunca cria um 2º PIX.
    idempotencia: dados.cobrancaId,
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'automatic',
      total_amount: valor,
      external_reference: dados.cobrancaId,
      payer: { email: dados.email },
      transactions: { payments: [{ amount: valor, payment_method: { id: 'pix', type: 'bank_transfer' } }] },
    }),
  })
  return converterOrder(corpo)
}

export async function consultarOrder(token: string, id: string): Promise<PixMercadoPago> {
  return converterOrder(await chamar<CorpoOrder>(token, `/v1/orders/${encodeURIComponent(id)}`))
}

/**
 * Confere o cabeçalho x-signature do webhook ("ts=...,v1=...").
 * Manifesto: id:{data.id};request-id:{x-request-id};ts:{ts}; — HMAC-SHA256 com a assinatura secreta.
 */
export function assinaturaValida(
  segredo: string,
  { assinatura, requestId, dataId }: { assinatura: string; requestId: string | null; dataId: string | null },
): boolean {
  const partes = Object.fromEntries(
    assinatura.split(',').map((parte) => {
      const [chave, ...valor] = parte.split('=')
      return [chave?.trim(), valor.join('=').trim()]
    }),
  )
  const { ts, v1 } = partes as { ts?: string; v1?: string }
  if (!ts || !v1) return false

  // A documentação manda o data.id em minúsculas; o SDK oficial usa como veio. Aceita os dois.
  const formas = new Set([dataId?.toLowerCase() ?? null, dataId])
  const recebida = Buffer.from(v1)
  return [...formas].some((id) => {
    const manifesto = `${id ? `id:${id};` : ''}${requestId ? `request-id:${requestId};` : ''}ts:${ts};`
    const esperada = Buffer.from(createHmac('sha256', segredo).update(manifesto).digest('hex'))
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida)
  })
}
