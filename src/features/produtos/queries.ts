import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'

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

/** Produtos ativos para montar pré-vendas e pedidos. */
export async function opcoesProdutos() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco, imagem_url, ativo')
    .eq('ativo', true)
    .order('nome')
  return data ?? []
}

/** Produtos específicos (inclusive inativos) — ex.: itens antigos de uma pré-venda. */
export async function produtosPorIds(ids: string[]) {
  if (ids.length === 0) return []
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco, imagem_url, ativo')
    .in('id', ids)
  return data ?? []
}
