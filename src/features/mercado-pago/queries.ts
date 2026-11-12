import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'

export type StatusMercadoPago = {
  conectado: boolean
  conta_id: string | null
  conta_nome: string | null
  conta_email: string | null
  conectado_em: string | null
  verificado_em: string | null
  notificacao_recebida_em: string | null
  ultimo_erro: string | null
  assinatura_webhook: boolean
  pix_recebidos: number
}

const SEM_CONEXAO: StatusMercadoPago = {
  conectado: false,
  conta_id: null,
  conta_nome: null,
  conta_email: null,
  conectado_em: null,
  verificado_em: null,
  notificacao_recebida_em: null,
  ultimo_erro: null,
  assinatura_webhook: false,
  pix_recebidos: 0,
}

/** Status da conexão (sem token nem assinatura), com a sessão do usuário. */
export async function statusMercadoPago(): Promise<StatusMercadoPago> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('status_mercado_pago')
  // Sem a migration aplicada o CRM continua funcionando (como "desconectado").
  if (error) {
    console.error('[mercado-pago] status', error.message)
    return SEM_CONEXAO
  }
  return { ...SEM_CONEXAO, ...((data ?? {}) as Partial<StatusMercadoPago>) }
}

/**
 * Início do link de pagamento (`https://.../pagar/`) para as mensagens de cobrança,
 * ou null quando o Mercado Pago não está conectado (as mensagens levam a chave PIX).
 */
export async function basePagamentoPix(): Promise<string | null> {
  const status = await statusMercadoPago()
  return status.conectado ? `${await urlDoSite()}/pagar/` : null
}

export type CobrancaPix = {
  id: string
  valor: number
  status: string
  valor_pago: number | null
  pago_em: string | null
  expira_em: string | null
  criado_em: string
  mp_pagamento_id: string | null
  detalhe: string | null
}

/** PIX gerados para um pedido (mais recentes primeiro). */
export async function cobrancasPixDoPedido(pedidoId: string): Promise<CobrancaPix[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('cobrancas_pix')
    .select('id, valor, status, valor_pago, pago_em, expira_em, criado_em, mp_pagamento_id, detalhe')
    .eq('pedido_id', pedidoId)
    .order('criado_em', { ascending: false })
  if (error) return []
  return data.map((c) => ({ ...c, valor: Number(c.valor), valor_pago: c.valor_pago === null ? null : Number(c.valor_pago) }))
}
