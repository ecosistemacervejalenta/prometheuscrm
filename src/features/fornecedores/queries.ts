import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'

export async function listarFornecedores(busca?: string) {
  const { supabase } = await exigirEquipe()
  let consulta = supabase
    .from('fornecedores')
    .select('*, fornecedor_vendedores(vendedores(id, nome, whatsapp))')
    .order('ativo', { ascending: false })
    .order('nome')
  if (busca) {
    const termo = termoBusca(busca)
    consulta = consulta.or(`nome.ilike.%${termo}%,razao_social.ilike.%${termo}%,cnpj.ilike.%${termo.replace(/\D/g, '') || termo}%`)
  }
  const { data, error } = await consulta
  if (error) throw error
  return data
}

export async function listarVendedores(busca?: string) {
  const { supabase } = await exigirEquipe()
  let consulta = supabase
    .from('vendedores')
    .select('*, fornecedor_vendedores(fornecedores(id, nome))')
    .order('ativo', { ascending: false })
    .order('nome')
  if (busca) consulta = consulta.ilike('nome', `%${termoBusca(busca)}%`)
  const { data, error } = await consulta
  if (error) throw error
  return data
}

export async function obterFornecedor(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('fornecedores')
    .select('*, fornecedor_vendedores(vendedores(id, nome))')
    .eq('id', id)
    .maybeSingle()
  return data
}

export async function obterVendedor(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('vendedores')
    .select('*, fornecedor_vendedores(fornecedor_id)')
    .eq('id', id)
    .maybeSingle()
  return data
}

/** Opções para selects (contas a pagar, produtos, vendedores). */
export async function opcoesFornecedores() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('fornecedores').select('id, nome, ativo').order('nome')
  return data ?? []
}
