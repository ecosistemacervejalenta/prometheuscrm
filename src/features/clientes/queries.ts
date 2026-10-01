import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'
import { normalizarWhatsapp } from '@/lib/whatsapp'

export const CLIENTES_POR_PAGINA = 30

export async function listarClientes({
  busca,
  vip,
  pagina = 1,
}: {
  busca?: string
  vip?: boolean
  pagina?: number
}) {
  const { supabase } = await exigirEquipe()
  const inicio = (pagina - 1) * CLIENTES_POR_PAGINA

  let consulta = supabase
    .from('vw_clientes')
    .select('*', { count: 'exact' })
    .order('ultimo_pedido_em', { ascending: false, nullsFirst: false })
    .order('nome')
    .range(inicio, inicio + CLIENTES_POR_PAGINA - 1)

  if (vip) consulta = consulta.eq('vip', true)
  if (busca) {
    const termo = termoBusca(busca)
    const digitos = busca.replace(/\D/g, '')
    const filtros = [`nome.ilike.%${termo}%`, `email.ilike.%${termo}%`]
    if (digitos.length >= 4) filtros.push(`whatsapp.ilike.%${digitos}%`)
    consulta = consulta.or(filtros.join(','))
  }

  const { data, count, error } = await consulta
  if (error) throw error
  return { clientes: data, total: count ?? 0 }
}

export async function obterCliente(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('vw_clientes').select('*').eq('id', id).maybeSingle()
  return data
}

export async function obterClienteParaEdicao(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
  return data
}

export async function pedidosDoCliente(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('vw_pedidos')
    .select('*')
    .eq('cliente_id', id)
    .order('criado_em', { ascending: false })
    .limit(50)
  return data ?? []
}

export async function atividadesDoCliente(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('atividades')
    .select('*')
    .eq('cliente_id', id)
    .order('criado_em', { ascending: false })
    .limit(30)
  return data ?? []
}

/** Busca rápida para seletores (pedido manual). */
export async function buscarClientesRapido(texto: string) {
  const { supabase } = await exigirEquipe()
  const termo = termoBusca(texto)
  if (termo.length < 2) return []
  const digitos = normalizarWhatsapp(texto)?.slice(-8)
  const filtros = [`nome.ilike.%${termo}%`]
  if (digitos && digitos.length >= 4) filtros.push(`whatsapp.ilike.%${digitos}%`)

  const { data } = await supabase
    .from('clientes')
    .select('id, nome, whatsapp, logradouro, vip')
    .or(filtros.join(','))
    .order('nome')
    .limit(8)
  return data ?? []
}
