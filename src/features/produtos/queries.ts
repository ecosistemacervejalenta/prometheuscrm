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

/** Produtos ativos para montar pré-vendas e pedidos. */
export async function opcoesProdutos() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco, imagem_url, ativo, fotos, cervejas_do_kit')
    .eq('ativo', true)
    .order('nome')
  return (data ?? []).map(paraCerveja)
}

/** Produtos específicos (inclusive inativos) — ex.: itens antigos de uma pré-venda. */
export async function produtosPorIds(ids: string[]) {
  if (ids.length === 0) return []
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco, imagem_url, ativo, fotos, cervejas_do_kit')
    .in('id', ids)
  return (data ?? []).map(paraCerveja)
}
