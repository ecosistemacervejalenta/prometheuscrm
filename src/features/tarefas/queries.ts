import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'
import type { PrioridadeTarefa, StatusTarefa } from '@/types'

import { BUCKET_TAREFAS, type SituacaoFiltro } from './schema'

/** Concluídas aparecem só as mais recentes; a busca encontra as antigas. */
export const LIMITE_CONCLUIDAS = 40

export type Pessoa = { id: string; nome: string }

export type TarefaQuadro = {
  id: string
  numero: number
  titulo: string
  status: StatusTarefa
  prioridade: PrioridadeTarefa
  prazo: string | null
  atrasada: boolean
  impedimento: string | null
  concluida_em: string | null
  responsaveis: Pessoa[]
  anexos: number
  comentarios: number
}

export type FiltrosTarefas = {
  busca?: string
  /** "eu" ou o id de um membro. */
  responsavel?: string
  prioridade?: PrioridadeTarefa
  situacao?: SituacaoFiltro
}

const CAMPOS_QUADRO =
  'id, numero, titulo, status, prioridade, prazo, atrasada, impedimento, concluida_em, responsaveis, anexos, comentarios'

type LinhaQuadro = {
  [K in keyof TarefaQuadro]: K extends 'responsaveis' ? unknown : TarefaQuadro[K] | null
}

function paraQuadro(t: LinhaQuadro): TarefaQuadro {
  return {
    id: t.id ?? '',
    numero: t.numero ?? 0,
    titulo: t.titulo ?? '',
    status: t.status ?? 'a_fazer',
    prioridade: t.prioridade ?? 'media',
    prazo: t.prazo,
    atrasada: Boolean(t.atrasada),
    impedimento: t.impedimento,
    concluida_em: t.concluida_em,
    responsaveis: Array.isArray(t.responsaveis) ? (t.responsaveis as Pessoa[]) : [],
    anexos: t.anexos ?? 0,
    comentarios: t.comentarios ?? 0,
  }
}

/** Quadro: tarefas abertas (todas) + concluídas mais recentes, com os filtros da URL. */
export async function listarQuadro(filtros: FiltrosTarefas) {
  const { supabase, perfil } = await exigirEquipe()
  const responsavel = filtros.responsavel === 'eu' ? perfil.id : filtros.responsavel
  const termo = filtros.busca ? termoBusca(filtros.busca.toLowerCase()) : ''

  const consulta = () => {
    let q = supabase.from('vw_tarefas').select(CAMPOS_QUADRO)
    if (termo) q = q.ilike('busca', `%${termo}%`)
    if (responsavel) q = q.contains('responsaveis_ids', [responsavel])
    if (filtros.prioridade) q = q.eq('prioridade', filtros.prioridade)
    if (filtros.situacao === 'atrasadas') q = q.eq('atrasada', true)
    if (filtros.situacao === 'impedidas') q = q.not('impedimento', 'is', null)
    if (filtros.situacao === 'sem_prazo') q = q.is('prazo', null)
    return q
  }

  const [abertas, concluidas] = await Promise.all([
    consulta()
      .neq('status', 'concluida')
      .order('prioridade', { ascending: false })
      .order('prazo', { ascending: true, nullsFirst: false })
      .order('numero'),
    // Atrasadas, impedidas e sem prazo só existem entre as abertas.
    filtros.situacao
      ? null
      : consulta().eq('status', 'concluida').order('concluida_em', { ascending: false }).limit(LIMITE_CONCLUIDAS),
  ])
  if (abertas.error) throw abertas.error
  if (concluidas?.error) throw concluidas.error

  return [...abertas.data, ...(concluidas?.data ?? [])].map((t) => paraQuadro(t as LinhaQuadro))
}

/** Números do topo do quadro (sem filtros): abertas, minhas, atrasadas, impedidas, sem prazo, concluídas em 7 dias. */
export async function resumoTarefas() {
  const { supabase, perfil } = await exigirEquipe()
  const seteDias = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const contar = () => supabase.from('vw_tarefas').select('id', { count: 'exact', head: true })

  const [abertas, minhas, atrasadas, impedidas, semPrazo, semana] = await Promise.all([
    contar().neq('status', 'concluida'),
    contar().neq('status', 'concluida').contains('responsaveis_ids', [perfil.id]),
    contar().eq('atrasada', true),
    contar().neq('status', 'concluida').not('impedimento', 'is', null),
    contar().neq('status', 'concluida').is('prazo', null),
    contar().eq('status', 'concluida').gte('concluida_em', seteDias),
  ])
  return {
    abertas: abertas.count ?? 0,
    minhas: minhas.count ?? 0,
    atrasadas: atrasadas.count ?? 0,
    impedidas: impedidas.count ?? 0,
    semPrazo: semPrazo.count ?? 0,
    concluidasSemana: semana.count ?? 0,
  }
}

/** Membros ativos (quem pode ser responsável). */
export async function listarEquipe(): Promise<Pessoa[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('perfis').select('id, nome, email').eq('ativo', true).order('nome')
  if (error) throw error
  return data.map((p) => ({ id: p.id, nome: p.nome || p.email || 'Sem nome' }))
}

export type EventoHistorico = {
  id: string
  tipo: string
  texto: string | null
  dados: Record<string, unknown>
  criado_em: string
  autor_id: string | null
  autor_nome: string | null
}

export type AnexoDetalhe = {
  id: string
  nome: string
  url: string | null
  largura: number | null
  altura: number | null
  criado_em: string
  enviado_por_nome: string | null
}

export type TarefaDetalhe = TarefaQuadro & {
  descricao: string | null
  criado_em: string
  criado_por: string | null
  criado_por_nome: string | null
  impedida_em: string | null
  impedida_por_nome: string | null
  historico: EventoHistorico[]
  imagens: AnexoDetalhe[]
  avisosNaoLidos: number
}

/** Cartão aberto: dados, histórico (mais recente primeiro) e imagens com link temporário. */
export async function obterTarefa(id: string): Promise<TarefaDetalhe | null> {
  const { supabase, perfil } = await exigirEquipe()
  const [tarefa, eventos, anexos, avisos] = await Promise.all([
    supabase.from('vw_tarefas').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('tarefa_eventos')
      .select('id, tipo, texto, dados, criado_em, autor_id, perfis(nome)')
      .eq('tarefa_id', id)
      .order('criado_em', { ascending: false })
      .limit(500),
    supabase
      .from('tarefa_anexos')
      .select('id, path, nome, largura, altura, criado_em, perfis(nome)')
      .eq('tarefa_id', id)
      .order('criado_em'),
    supabase
      .from('notificacoes')
      .select('id', { count: 'exact', head: true })
      .eq('perfil_id', perfil.id)
      .eq('tarefa_id', id)
      .is('lida_em', null),
  ])
  if (tarefa.error) throw tarefa.error
  if (!tarefa.data) return null
  if (eventos.error) throw eventos.error
  if (anexos.error) throw anexos.error

  const caminhos = anexos.data.map((a) => a.path)
  const assinadas = caminhos.length
    ? await supabase.storage.from(BUCKET_TAREFAS).createSignedUrls(caminhos, 60 * 60 * 6)
    : null
  const urls = new Map((assinadas?.data ?? []).map((a) => [a.path, a.signedUrl]))

  const t = tarefa.data
  return {
    ...paraQuadro(t as LinhaQuadro),
    descricao: t.descricao,
    criado_em: t.criado_em ?? '',
    criado_por: t.criado_por,
    criado_por_nome: t.criado_por_nome,
    impedida_em: t.impedida_em,
    impedida_por_nome: t.impedida_por_nome,
    historico: eventos.data.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      texto: e.texto,
      dados: (e.dados ?? {}) as Record<string, unknown>,
      criado_em: e.criado_em,
      autor_id: e.autor_id,
      autor_nome: e.perfis?.nome ?? null,
    })),
    imagens: anexos.data.map((a) => ({
      id: a.id,
      nome: a.nome,
      url: urls.get(a.path) ?? null,
      largura: a.largura,
      altura: a.altura,
      criado_em: a.criado_em,
      enviado_por_nome: a.perfis?.nome ?? null,
    })),
    avisosNaoLidos: avisos.count ?? 0,
  }
}
