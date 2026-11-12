import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Chamadas à API do Mercado Pago (Checkout Transparente · PIX).
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
 */

const API = 'https://api.mercadopago.com'

export type ContaMercadoPago = { id: string; nome: string | null; email: string | null }

export type PagamentoMercadoPago = {
  id: string
  status: string
  statusDetalhe: string | null
  valor: number
  aprovadoEm: string | null
  expiraEm: string | null
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

type CorpoPagamento = {
  id: number | string
  status?: string
  status_detail?: string | null
  transaction_amount?: number
  date_approved?: string | null
  date_of_expiration?: string | null
  external_reference?: string | null
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } }
}

async function chamar<T>(token: string, caminho: string, init?: RequestInit & { idempotencia?: string }): Promise<T> {
  const resposta = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.idempotencia ? { 'X-Idempotency-Key': init.idempotencia } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const corpo = (await resposta.json().catch(() => null)) as (T & { message?: string; cause?: Array<{ description?: string }> }) | null
  if (!resposta.ok || !corpo) {
    const motivo = corpo?.cause?.[0]?.description || corpo?.message || `HTTP ${resposta.status}`
    throw new ErroMercadoPago(traduzirErro(resposta.status, motivo), resposta.status)
  }
  return corpo
}

function traduzirErro(status: number, motivo: string): string {
  if (status === 401) return 'O Mercado Pago recusou o Access Token (inválido ou revogado). Gere um novo em Suas integrações › Credenciais de produção.'
  if (status === 403) return `O Mercado Pago bloqueou a operação nesta conta: ${motivo}. Confira se a conta tem chave PIX cadastrada.`
  return `Mercado Pago: ${motivo}`
}

function converterPagamento(p: CorpoPagamento): PagamentoMercadoPago {
  const dados = p.point_of_interaction?.transaction_data
  return {
    id: String(p.id),
    status: p.status ?? 'pending',
    statusDetalhe: p.status_detail ?? null,
    valor: Number(p.transaction_amount ?? 0),
    aprovadoEm: p.date_approved ?? null,
    expiraEm: p.date_of_expiration ?? null,
    referencia: p.external_reference ?? null,
    copiaECola: dados?.qr_code ?? null,
    qrCodeBase64: dados?.qr_code_base64 ?? null,
    linkMp: dados?.ticket_url ?? null,
  }
}

/** Confere o token e devolve a conta dona dele. */
export async function consultarConta(token: string): Promise<ContaMercadoPago> {
  const eu = await chamar<{ id: number; nickname?: string; email?: string; first_name?: string; last_name?: string }>(token, '/users/me')
  const nomePessoa = [eu.first_name, eu.last_name].filter(Boolean).join(' ')
  return { id: String(eu.id), nome: eu.nickname || nomePessoa || null, email: eu.email ?? null }
}

/** "2026-11-13T19:48:31.000-03:00" — o formato que o Mercado Pago aceita em date_of_expiration. */
function dataMercadoPago(data: Date): string {
  const brasilia = new Date(data.getTime() - 3 * 60 * 60 * 1000)
  return `${brasilia.toISOString().slice(0, 23)}-03:00`
}

export async function criarPagamentoPix(
  token: string,
  dados: {
    cobrancaId: string
    valor: number
    descricao: string
    expiraEm: Date
    urlNotificacao: string | null
    pagador: { email: string; nome: string }
  },
): Promise<PagamentoMercadoPago> {
  const [primeiro, ...resto] = dados.pagador.nome.trim().split(/\s+/)
  const corpo = await chamar<CorpoPagamento>(token, '/v1/payments', {
    method: 'POST',
    // Mesma chave = mesmo pagamento: repetir a chamada nunca cria um 2º PIX.
    idempotencia: dados.cobrancaId,
    body: JSON.stringify({
      transaction_amount: Math.round(dados.valor * 100) / 100,
      description: dados.descricao.slice(0, 250),
      payment_method_id: 'pix',
      external_reference: dados.cobrancaId,
      date_of_expiration: dataMercadoPago(dados.expiraEm),
      ...(dados.urlNotificacao ? { notification_url: dados.urlNotificacao } : {}),
      payer: { email: dados.pagador.email, first_name: primeiro || 'Cliente', last_name: resto.join(' ') || undefined },
    }),
  })
  return converterPagamento(corpo)
}

export async function consultarPagamento(token: string, id: string): Promise<PagamentoMercadoPago> {
  return converterPagamento(await chamar<CorpoPagamento>(token, `/v1/payments/${encodeURIComponent(id)}`))
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

  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
  const manifesto = `${id ? `id:${id};` : ''}${requestId ? `request-id:${requestId};` : ''}ts:${ts};`
  const esperado = createHmac('sha256', segredo).update(manifesto).digest('hex')
  const a = Buffer.from(esperado)
  const b = Buffer.from(v1)
  return a.length === b.length && timingSafeEqual(a, b)
}
