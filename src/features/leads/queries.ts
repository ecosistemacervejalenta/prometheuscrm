import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'

import type { ContagemDdd } from './ddd'
import type { ColunaPlanilha } from './planilha'

export const LEADS_POR_PAGINA = 50

export type FiltroLeads = 'com_whatsapp' | 'sem_whatsapp' | 'clientes' | 'nao_clientes'

export async function listarPastas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('vw_leads_pastas').select('*').order('nome')
  if (error) throw error
  return data
}

export async function opcoesPastas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('leads_pastas').select('id, nome').order('nome')
  if (error) throw error
  return data
}

export async function obterPasta(id: string) {
  const { supabase } = await exigirEquipe()
  const [pasta, listas] = await Promise.all([
    supabase.from('vw_leads_pastas').select('*').eq('id', id).maybeSingle(),
    supabase.from('leads_listas').select('*').eq('pasta_id', id).order('criado_em', { ascending: false }),
  ])
  if (!pasta.data) return null
  if (listas.error) throw listas.error
  return { ...pasta.data, listasDaPasta: listas.data }
}

export async function obterLista(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('leads_listas').select('*, leads_pastas(id, nome)').eq('id', id).maybeSingle()
  if (!data) return null
  // Com o "whatsapp não nulo" a contagem sai só do índice (lista_id, whatsapp), sem ler a tabela.
  const { count: jaClientes } = await supabase
    .from('vw_leads')
    .select('id', { count: 'exact', head: true })
    .eq('lista_id', id)
    .not('whatsapp', 'is', null)
    .eq('ja_cliente', true)
  return { ...data, colunas: (data.colunas ?? []) as ColunaPlanilha[], jaClientes: jaClientes ?? 0 }
}

/** Quantos números (sem repetir) há de cada DDD na pasta ou na lista; ddd nulo = sem DDD do Brasil. */
export async function contarDdds(escopo: { pastaId: string } | { listaId: string }): Promise<ContagemDdd[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc(
    'ddds_dos_leads',
    'pastaId' in escopo ? { p_pasta_id: escopo.pastaId } : { p_lista_id: escopo.listaId },
  )
  if (error) throw error
  return data
}

export async function listarLeads(
  listaId: string,
  { busca, filtro, ddd, pagina = 1 }: { busca?: string; filtro?: FiltroLeads; ddd?: string; pagina?: number },
) {
  const { supabase } = await exigirEquipe()
  const inicio = (pagina - 1) * LEADS_POR_PAGINA
  let consulta = supabase
    .from('vw_leads')
    .select('*', { count: 'exact' })
    .eq('lista_id', listaId)
    .order('linha')
    .range(inicio, inicio + LEADS_POR_PAGINA - 1)

  if (filtro === 'com_whatsapp') consulta = consulta.not('whatsapp', 'is', null)
  if (filtro === 'sem_whatsapp') consulta = consulta.is('whatsapp', null)
  if (filtro === 'clientes') consulta = consulta.not('whatsapp', 'is', null).eq('ja_cliente', true)
  if (filtro === 'nao_clientes') consulta = consulta.not('whatsapp', 'is', null).eq('ja_cliente', false)
  if (ddd) consulta = consulta.eq('ddd', ddd)
  if (busca) consulta = consulta.ilike('busca', `%${termoBusca(busca).toLowerCase()}%`)

  const { data, count, error } = await consulta
  if (error) throw error
  return { leads: data, total: count ?? 0 }
}
