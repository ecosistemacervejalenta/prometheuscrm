import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'
import type { CanalVenda, SituacaoFrete, StatusPagamento, StatusPedido } from '@/types'

export const PEDIDOS_POR_PAGINA = 30

export type FiltroPagamento = 'em_aberto' | StatusPagamento

function statusDoFiltro(filtro?: FiltroPagamento): StatusPagamento[] | null {
  if (!filtro) return null
  return filtro === 'em_aberto' ? ['pendente', 'cobrado'] : [filtro]
}

export async function listarPedidos({
  busca,
  canal,
  pagamento,
  status,
  pagina = 1,
}: {
  busca?: string
  canal?: CanalVenda
  pagamento?: FiltroPagamento
  status?: StatusPedido
  pagina?: number
}) {
  const { supabase } = await exigirEquipe()
  const inicio = (pagina - 1) * PEDIDOS_POR_PAGINA

  let consulta = supabase
    .from('vw_pedidos')
    .select('*', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .range(inicio, inicio + PEDIDOS_POR_PAGINA - 1)

  if (canal) consulta = consulta.eq('canal', canal)
  if (status) consulta = consulta.eq('status', status)
  const statusPagamento = statusDoFiltro(pagamento)
  if (statusPagamento) consulta = consulta.in('status_pagamento', statusPagamento).neq('status', 'cancelado')
  if (busca) {
    const numero = busca.replace(/\D/g, '')
    consulta = numero.length >= 4 && numero.length <= 9
      ? consulta.or(`numero.eq.${numero},cliente_nome.ilike.%${termoBusca(busca)}%`)
      : consulta.ilike('cliente_nome', `%${termoBusca(busca)}%`)
  }

  const { data, count, error } = await consulta
  if (error) throw error
  return { pedidos: data, total: count ?? 0 }
}

export async function obterPedido(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('pedidos')
    .select('*, clientes(*), pre_vendas(id, titulo, slug), pedido_itens(*)')
    .eq('id', id)
    .maybeSingle()
  return data
}

export async function atividadesDoPedido(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('atividades')
    .select('*')
    .eq('pedido_id', id)
    .order('criado_em', { ascending: false })
  return data ?? []
}

/** Pedidos com cliente e itens (Grupo VIP, impressão, cobranças). */
export async function pedidosComItens(filtros: {
  canal?: CanalVenda
  preVendaId?: string
  inicio?: string
  fim?: string
  pagamento?: FiltroPagamento
  frete?: SituacaoFrete
}) {
  const { supabase } = await exigirEquipe()
  let consulta = supabase
    .from('pedidos')
    .select(
      'id, numero, criado_em, status, status_pagamento, total, subtotal, taxa_entrega, desconto, frete, cobrancas_enviadas, ultima_cobranca_em, endereco_entrega, observacoes, clientes(id, nome, whatsapp), pre_vendas(titulo), pedido_itens(produto_id, descricao, quantidade, total)',
    )
    .neq('status', 'cancelado')
    .order('criado_em', { ascending: true })

  if (filtros.canal) consulta = consulta.eq('canal', filtros.canal)
  if (filtros.preVendaId) consulta = consulta.eq('pre_venda_id', filtros.preVendaId)
  if (filtros.inicio) consulta = consulta.gte('criado_em', filtros.inicio)
  if (filtros.fim) consulta = consulta.lt('criado_em', filtros.fim)
  if (filtros.frete) consulta = consulta.eq('frete', filtros.frete)
  const statusPagamento = statusDoFiltro(filtros.pagamento)
  if (statusPagamento) consulta = consulta.in('status_pagamento', statusPagamento)

  const { data, error } = await consulta
  if (error) throw error
  return data
}

export type PedidoComItens = Awaited<ReturnType<typeof pedidosComItens>>[number]
