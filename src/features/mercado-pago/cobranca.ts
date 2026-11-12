import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'

import { consultarConta, consultarOrder, criarOrderPix, ErroMercadoPago, type PixMercadoPago } from './api'

/**
 * PIX dos pedidos pelo Mercado Pago. Roda SÓ com a chave secreta do Supabase
 * (link público, webhook e rotina): o Access Token sai do Vault só aqui.
 */

type Banco = SupabaseClient<Database>

/** O que o link do cliente precisa para pagar (nunca leva dados de outros pedidos). */
export type SituacaoPix =
  | { situacao: 'sem_integracao' }
  | { situacao: 'pago' | 'cancelado' | 'aguardando_frete'; numero: number; pago: number; total: number }
  | {
      situacao: 'pendente'
      numero: number
      pago: number
      total: number
      valor: number
      copiaECola: string
      qrCodeBase64: string | null
      expiraEm: string | null
    }
  | { situacao: 'erro'; mensagem: string }

type Preparo = {
  situacao: 'pago' | 'cancelado' | 'aguardando_frete' | 'pendente' | 'criar'
  pedido_id: string
  numero: number
  total: number
  pago: number
  devido: number
  cliente_nome: string | null
  cliente_email: string | null
  pre_venda_titulo: string | null
  cobranca?: {
    id: string
    valor: number
    expira_em: string | null
    copia_e_cola: string | null
    qr_code_base64: string | null
  }
}

/** Validade do PIX: o padrão do Mercado Pago para orders PIX (24 h). */
const VALIDADE_MINUTOS = 24 * 60
/** Intervalo mínimo entre duas conferências diretas no Mercado Pago para a mesma cobrança. */
const CONSULTA_MINIMA_MS = 8_000

export async function credenciais(db: Banco): Promise<{ token: string; segredoWebhook: string | null } | null> {
  const { data } = await db.rpc('credenciais_mercado_pago')
  const linha = data?.[0]
  return linha?.access_token ? { token: linha.access_token, segredoWebhook: linha.segredo_webhook || null } : null
}

export async function mercadoPagoConectado(db: Banco): Promise<boolean> {
  const { data } = await db.from('integracao_mercado_pago').select('conta_id').eq('id', 1).maybeSingle()
  return Boolean(data?.conta_id)
}

function emailDoPagador(preparo: Preparo, site: string): string {
  const email = preparo.cliente_email?.trim()
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email
  // O link não pede e-mail; o Mercado Pago exige um. Endereço próprio por pedido, no domínio do CRM.
  const dominio = new URL(site).hostname.replace(/^www\./, '')
  return `pedido${preparo.numero}@${dominio.includes('.') ? dominio : 'prometheuscrm.com.br'}`
}

function respostaDoPreparo(p: Preparo): SituacaoPix {
  const base = { numero: Number(p.numero), pago: Number(p.pago), total: Number(p.total) }
  if (p.situacao === 'pendente' && p.cobranca?.copia_e_cola) {
    return {
      situacao: 'pendente',
      ...base,
      valor: Number(p.cobranca.valor),
      copiaECola: p.cobranca.copia_e_cola,
      qrCodeBase64: p.cobranca.qr_code_base64,
      expiraEm: p.cobranca.expira_em,
    }
  }
  if (p.situacao === 'pago' || p.situacao === 'cancelado' || p.situacao === 'aguardando_frete') return { situacao: p.situacao, ...base }
  return { situacao: 'erro', mensagem: 'Não foi possível gerar o PIX agora.' }
}

/**
 * PIX do que falta pagar no pedido: reaproveita um ainda válido ou cria no Mercado Pago.
 * `site` monta a URL do webhook (domínio por onde o cliente abriu o link).
 */
export async function obterPixDoPedido(db: Banco, pedidoId: string, site: string): Promise<SituacaoPix> {
  const acesso = await credenciais(db)
  if (!acesso) return { situacao: 'sem_integracao' }

  const { data, error } = await db.rpc('preparar_cobranca_pix', { p_pedido_id: pedidoId, p_validade_minutos: VALIDADE_MINUTOS })
  if (error || !data) {
    console.error('[mercado-pago] preparar cobrança', error)
    return { situacao: 'erro', mensagem: 'Pedido não encontrado.' }
  }
  const preparo = data as unknown as Preparo
  if (preparo.situacao !== 'criar' || !preparo.cobranca) return respostaDoPreparo(preparo)

  const cobranca = preparo.cobranca
  try {
    // Avisos de pagamento chegam pelo webhook configurado no painel (tópico Order); a tela e a rotina também conferem.
    const pagamento = await criarOrderPix(acesso.token, {
      cobrancaId: cobranca.id,
      valor: Number(cobranca.valor),
      email: emailDoPagador(preparo, site),
    })
    if (!pagamento.copiaECola) throw new ErroMercadoPago('O Mercado Pago não devolveu o código PIX.', 502)

    await db.rpc('concluir_cobranca_pix', {
      p_cobranca_id: cobranca.id,
      p_dados: {
        mp_pagamento_id: pagamento.id,
        copia_e_cola: pagamento.copiaECola,
        qr_code_base64: pagamento.qrCodeBase64,
        link_mp: pagamento.linkMp,
      },
    })
    return {
      situacao: 'pendente',
      numero: Number(preparo.numero),
      pago: Number(preparo.pago),
      total: Number(preparo.total),
      valor: Number(cobranca.valor),
      copiaECola: pagamento.copiaECola,
      qrCodeBase64: pagamento.qrCodeBase64,
      expiraEm: cobranca.expira_em,
    }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'erro'
    console.error('[mercado-pago] criar PIX', mensagem)
    await db.rpc('concluir_cobranca_pix', { p_cobranca_id: cobranca.id, p_dados: { erro: mensagem } })
    if (e instanceof ErroMercadoPago && e.status === 401) {
      await db.from('integracao_mercado_pago').update({ ultimo_erro: mensagem }).eq('id', 1)
    }
    return { situacao: 'erro', mensagem: 'Não foi possível gerar o PIX agora.' }
  }
}

/** Grava no CRM a situação de uma order conferida na API (fonte da verdade). */
async function registrar(db: Banco, pagamento: PixMercadoPago, cobrancaId: string | null) {
  const { data, error } = await db.rpc('registrar_status_pix', {
    p_cobranca_id: cobrancaId ?? pagamento.referencia,
    p_mp_pagamento_id: pagamento.id,
    p_status_mp: pagamento.status,
    p_valor_pago: pagamento.valor,
    p_pago_em: pagamento.aprovadoEm,
    p_detalhe: pagamento.statusDetalhe,
  })
  if (error) throw error
  return data as { pedido_id: string; numero: number; status: string; quitou: boolean } | null
}

/** Webhook: busca a order no Mercado Pago e dá baixa se for de um pedido do CRM. */
export async function sincronizarOrder(db: Banco, orderId: string) {
  const acesso = await credenciais(db)
  if (!acesso) return null
  const pagamento = await consultarOrder(acesso.token, orderId)
  if (pagamento.referencia && !/^[0-9a-f-]{36}$/i.test(pagamento.referencia)) return null // venda de outra origem
  return registrar(db, pagamento, null)
}

/**
 * O link pergunta "já pagou?" a cada poucos segundos. Lê o banco; se o PIX ainda está
 * pendente, confere direto no Mercado Pago (no máximo a cada CONSULTA_MINIMA_MS).
 */
export async function conferirPixDoPedido(db: Banco, pedidoId: string): Promise<'pago' | 'pendente' | 'aguardando_frete' | 'expirado'> {
  const [{ data: pedido }, { data: cobranca }] = await Promise.all([
    db.from('pedidos').select('status_pagamento, frete').eq('id', pedidoId).maybeSingle(),
    db
      .from('cobrancas_pix')
      .select('id, status, mp_pagamento_id, consultado_em, expira_em')
      .eq('pedido_id', pedidoId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!pedido) return 'expirado'
  if (pedido.status_pagamento === 'pago') return 'pago'
  if (!cobranca) return 'pendente'
  if (cobranca.status === 'pago') return pedido.frete === 'a_cotar' ? 'aguardando_frete' : 'pendente'
  if (cobranca.status !== 'pendente' || !cobranca.mp_pagamento_id) return cobranca.status === 'criando' ? 'pendente' : 'expirado'

  const recente = cobranca.consultado_em && Date.now() - new Date(cobranca.consultado_em).getTime() < CONSULTA_MINIMA_MS
  if (recente) return 'pendente'

  const acesso = await credenciais(db)
  if (!acesso) return 'pendente'
  await db.from('cobrancas_pix').update({ consultado_em: new Date().toISOString() }).eq('id', cobranca.id)
  try {
    const resultado = await registrar(db, await consultarOrder(acesso.token, cobranca.mp_pagamento_id), cobranca.id)
    if (resultado?.status === 'pago') return resultado.quitou ? 'pago' : pedido.frete === 'a_cotar' ? 'aguardando_frete' : 'pendente'
    if (resultado?.status === 'expirado' || resultado?.status === 'cancelado') return 'expirado'
  } catch (e) {
    console.error('[mercado-pago] conferir PIX', e instanceof Error ? e.message : e)
  }
  return 'pendente'
}

/** Rotina: confere os PIX pendentes (rede de segurança para avisos perdidos). */
export async function reconciliarPendentes(db: Banco): Promise<{ conferidos: number; pagos: number; erros: number }> {
  const acesso = await credenciais(db)
  if (!acesso) return { conferidos: 0, pagos: 0, erros: 0 }
  const desde = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: pendentes } = await db
    .from('cobrancas_pix')
    .select('id, mp_pagamento_id')
    .eq('status', 'pendente')
    .gte('criado_em', desde)
    .not('mp_pagamento_id', 'is', null)
    .order('criado_em')
    .limit(200)

  let pagos = 0
  let erros = 0
  for (const c of pendentes ?? []) {
    try {
      const r = await registrar(db, await consultarOrder(acesso.token, c.mp_pagamento_id!), c.id)
      if (r?.status === 'pago') pagos++
    } catch (e) {
      erros++
      console.error('[mercado-pago] reconciliar', c.mp_pagamento_id, e instanceof Error ? e.message : e)
    }
  }
  return { conferidos: pendentes?.length ?? 0, pagos, erros }
}

/** "Testar conexão" da tela de configurações. */
export async function verificarConexao(db: Banco): Promise<{ ok: boolean; mensagem: string }> {
  const acesso = await credenciais(db)
  if (!acesso) return { ok: false, mensagem: 'O Mercado Pago não está conectado.' }
  try {
    const conta = await consultarConta(acesso.token)
    await db
      .from('integracao_mercado_pago')
      .update({ conta_id: conta.id, conta_nome: conta.nome, conta_email: conta.email, verificado_em: new Date().toISOString(), ultimo_erro: null })
      .eq('id', 1)
    return { ok: true, mensagem: `Conexão OK: conta ${conta.nome ?? conta.id}.` }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Falha ao falar com o Mercado Pago.'
    await db.from('integracao_mercado_pago').update({ ultimo_erro: mensagem, verificado_em: new Date().toISOString() }).eq('id', 1)
    return { ok: false, mensagem }
  }
}
