import 'server-only'

import { cache } from 'react'

import { exigirEquipe } from '@/lib/auth'

import type { ConexaoMeta } from './meta'

const SEM_CONEXAO: ConexaoMeta = {
  configurado: false,
  tem_app_secret: false,
  app_id: null,
  phone_number_id: null,
  waba_id: null,
  numero: null,
  nome_verificado: null,
  qualidade: null,
  limite_tier: null,
  status_nome: null,
  conectado_em: null,
  verificado_em: null,
  webhook_recebido_em: null,
  ultimo_erro: null,
  preco_marketing: null,
  preco_moeda: null,
  preco_marketing_dia: null,
  token_verificacao: null,
}

/** Status da conexão com a Meta (sem segredos). */
export async function conexaoMeta(): Promise<ConexaoMeta> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('status_whatsapp_oficial')
  if (error) throw error
  return { ...SEM_CONEXAO, ...(data as Partial<ConexaoMeta> | null) }
}

export type ListaParaCampanha = {
  id: string
  nome: string
  pasta: string
  comWhatsapp: number
  /** Números da lista por DDD ({"11": 97, ...}), guardados ao concluir a importação. */
  ddds: Record<string, number>
}

/** Listas do Banco de Leads prontas e com WhatsApp, para escolher o público. */
export async function listasParaCampanha(): Promise<ListaParaCampanha[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('leads_listas')
    .select('id, nome, com_whatsapp, ddds, leads_pastas(nome)')
    .eq('status', 'pronta')
    .gt('com_whatsapp', 0)
    .order('nome')
  if (error) throw error
  return data
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      pasta: l.leads_pastas?.nome ?? 'Sem pasta',
      comWhatsapp: l.com_whatsapp,
      ddds: contagemPorDdd(l.ddds),
    }))
    .sort((a, b) => a.pasta.localeCompare(b.pasta, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** {"11": 97, ...} guardado na lista → só DDDs com números. */
function contagemPorDdd(ddds: unknown): Record<string, number> {
  const mapa = ddds && typeof ddds === 'object' && !Array.isArray(ddds) ? (ddds as Record<string, unknown>) : {}
  return Object.fromEntries(
    Object.entries(mapa)
      .map(([ddd, n]) => [ddd, Number(n) || 0] as const)
      .filter(([, n]) => n > 0),
  )
}

export async function listarCampanhas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('vw_campanhas').select('*').order('criado_em', { ascending: false }).limit(200)
  if (error) throw error
  return data
}

/** Campanha com os números (memoizada: a página e o generateMetadata usam a mesma consulta). */
export const obterCampanha = cache(async (id: string) => {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('vw_campanhas').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  const { data: autor } = data.criado_por
    ? await supabase.from('perfis').select('nome').eq('id', data.criado_por).maybeSingle()
    : { data: null }
  return { ...data, autor: autor?.nome ?? null }
})

/** Quem respondeu (mais recentes primeiro). */
export async function respostasDaCampanha(id: string) {
  const { supabase, perfil } = await exigirEquipe()
  const { data, error } = await supabase
    .from('campanha_envios')
    .select('id, whatsapp, nome, resposta, respondida_em, saiu_em, conversa_em, conversa_atendimento_id, chamou:perfis!campanha_envios_conversa_por_fkey(nome)')
    .eq('campanha_id', id)
    .not('respondida_em', 'is', null)
    .order('respondida_em', { ascending: false })
    .limit(100)
  if (error) throw error

  // Quem já conversa com a loja (atendimento aberto no WhatsApp de atendimento) e com quem.
  const numeros = [...new Set(data.map((r) => r.whatsapp))]
  const { data: abertos, error: erroAbertos } = numeros.length
    ? await supabase
        .from('vw_atendimentos')
        .select('id, whatsapp, responsavel_id, responsavel_nome')
        .in('whatsapp', numeros)
        .neq('status', 'resolvido')
    : { data: [], error: null }
  if (erroAbertos) throw erroAbertos
  const porNumero = new Map(abertos.map((a) => [a.whatsapp, a]))

  return data.map(({ chamou, ...r }) => {
    const aberto = porNumero.get(r.whatsapp)
    return {
      ...r,
      chamado_por: chamou?.nome ?? null,
      conversa_aberta: aberto?.id
        ? { id: aberto.id, comigo: aberto.responsavel_id === perfil.id, responsavel: aberto.responsavel_nome }
        : null,
    }
  })
}

export type RespostaCampanha = Awaited<ReturnType<typeof respostasDaCampanha>>[number]

/** Envios que falharam, agrupados pelo motivo. */
export async function falhasDaCampanha(id: string) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('campanha_envios')
    .select('erro, erro_codigo')
    .eq('campanha_id', id)
    .in('status', ['falhou', 'ignorada'])
    .limit(5000)
  if (error) throw error
  const grupos = new Map<string, number>()
  for (const f of data) {
    const motivo = f.erro ?? 'Motivo não informado.'
    grupos.set(motivo, (grupos.get(motivo) ?? 0) + 1)
  }
  return [...grupos.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade)
}

/** Quantas pessoas pediram para não receber campanhas. */
export async function contarDescadastros() {
  const { supabase } = await exigirEquipe()
  const { count } = await supabase.from('whatsapp_descadastros').select('whatsapp', { count: 'exact', head: true })
  return count ?? 0
}
