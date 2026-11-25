import 'server-only'

import { exigirEquipe } from '@/lib/auth'

export async function listarPreVendas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('vw_pre_vendas').select('*').order('criado_em', { ascending: false })
  if (error) throw error
  return data
}

export async function listarPreVendasAtivas() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('vw_pre_vendas')
    .select('*')
    .eq('status_efetivo', 'ativa')
    .order('criado_em', { ascending: false })
  return data ?? []
}

export async function obterPreVenda(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('vw_pre_vendas').select('*').eq('id', id).maybeSingle()
  return data
}

export async function itensDaPreVenda(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('vw_pre_venda_itens').select('*').eq('pre_venda_id', id).order('ordem')
  return data ?? []
}

/**
 * Estoque da Olist que esta pré-venda tem baixado agora (o que o botão "Devolver estoque à
 * Olist" devolveria) e a última devolução manual.
 */
export async function estoqueOlistDaPreVenda(id: string) {
  const { supabase } = await exigirEquipe()
  const [{ data: baixado, error }, { data: pv }] = await Promise.all([
    supabase.rpc('estoque_olist_baixado_pre_venda', { p_pre_venda_id: id }),
    supabase.from('pre_vendas').select('estoque_olist_devolvido_em, estoque_olist_devolvido_por').eq('id', id).maybeSingle(),
  ])
  if (error) console.error('[pre-venda] estoque baixado na Olist', error.message)
  let devolvidoPor: string | null = null
  if (pv?.estoque_olist_devolvido_por) {
    const { data: perfil } = await supabase.from('perfis').select('nome').eq('id', pv.estoque_olist_devolvido_por).maybeSingle()
    devolvidoPor = perfil?.nome ?? null
  }
  return { baixado: baixado ?? [], devolvidoEm: pv?.estoque_olist_devolvido_em ?? null, devolvidoPor }
}

export async function pedidosDaPreVenda(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('vw_pedidos')
    .select('*')
    .eq('pre_venda_id', id)
    .order('criado_em', { ascending: false })
  return data ?? []
}

export async function obterPreVendaParaEdicao(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('pre_vendas')
    .select('*, pre_venda_itens(produto_id, preco, limite_por_cliente, quantidade_disponivel, ordem)')
    .eq('id', id)
    .maybeSingle()
  return data
}

/** Pré-vendas para filtros (Grupo VIP, pedido manual). */
export async function opcoesPreVendas(canal?: 'grupo_vip') {
  const { supabase } = await exigirEquipe()
  let consulta = supabase
    .from('vw_pre_vendas')
    .select('id, titulo, slug, descricao, encerra_em, previsao_entrega, status_efetivo, canal, criado_em')
    .order('criado_em', { ascending: false })
  if (canal) consulta = consulta.eq('canal', canal)
  const { data } = await consulta
  return data ?? []
}
