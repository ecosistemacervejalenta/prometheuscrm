import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'

import { lerKit } from './kit'

/** Linha do banco → cerveja pronta para a tela (números e kit já convertidos). */
function paraCerveja<T extends { preco: number; teor_alcoolico: number | null; cervejas_do_kit: unknown; fotos: string[] | null }>(p: T) {
  return {
    ...p,
    preco: Number(p.preco),
    teor_alcoolico: p.teor_alcoolico === null ? null : Number(p.teor_alcoolico),
    fotos: p.fotos ?? [],
    cervejas_do_kit: lerKit(p.cervejas_do_kit),
  }
}

export async function listarProdutos({ busca, inativos = false }: { busca?: string; inativos?: boolean } = {}) {
  const { supabase } = await exigirEquipe()
  let consulta = supabase.from('produtos').select('*, fornecedores(nome)').order('ativo', { ascending: false }).order('nome')
  if (!inativos) consulta = consulta.eq('ativo', true)
  if (busca) {
    const termo = termoBusca(busca)
    consulta = consulta.or(`nome.ilike.%${termo}%,estilo.ilike.%${termo}%,cervejaria.ilike.%${termo}%,sku.ilike.%${termo}%`)
  }
  const { data, error } = await consulta
  if (error) throw error
  return data
}

export async function obterProduto(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('produtos').select('*').eq('id', id).maybeSingle()
  return data
}

const CAMPOS_OPCAO = 'id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco, imagem_url, ativo, fotos, cervejas_do_kit, olist_id'

type Supabase = Awaited<ReturnType<typeof exigirEquipe>>['supabase']

/** Estoque da Olist (já descontado o que o CRM vendeu) dos produtos vinculados. */
async function comEstoqueOlist<T extends { id: string; olist_id: number | null }>(supabase: Supabase, produtos: T[]) {
  const vinculados = produtos.filter((p) => p.olist_id).map((p) => p.id)
  if (vinculados.length === 0) return produtos.map((p) => ({ ...p, estoque_olist: null as number | null }))
  const { data } = await supabase.rpc('estoques_olist_produtos', { p_produto_ids: vinculados })
  const estoque = new Map((data ?? []).map((e) => [e.produto_id, e.estoque]))
  return produtos.map((p) => ({ ...p, estoque_olist: estoque.get(p.id) ?? null }))
}

/** Produtos ativos para montar pré-vendas e pedidos. */
export async function opcoesProdutos() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('produtos').select(CAMPOS_OPCAO).eq('ativo', true).order('nome')
  return comEstoqueOlist(supabase, (data ?? []).map(paraCerveja))
}

/** Produtos específicos (inclusive inativos) — ex.: itens antigos de uma pré-venda. */
export async function produtosPorIds(ids: string[]) {
  if (ids.length === 0) return []
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('produtos').select(CAMPOS_OPCAO).in('id', ids)
  return comEstoqueOlist(supabase, (data ?? []).map(paraCerveja))
}
