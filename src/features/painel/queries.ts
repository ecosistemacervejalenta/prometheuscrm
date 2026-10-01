import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { intervaloDoMes, mesAtual, somarMeses } from '@/lib/datas'
import type { CanalVenda, MetricasPainel } from '@/types'

const VAZIO: MetricasPainel = {
  receita: 0,
  pedidos: 0,
  ticket_medio: 0,
  recebido: 0,
  a_receber: 0,
  pedidos_a_receber: 0,
  clientes: 0,
  clientes_novos: 0,
  clientes_vip: 0,
  pre_vendas_ativas: 0,
}

async function metricasDoMes(mes: string): Promise<MetricasPainel> {
  const { supabase } = await exigirEquipe()
  const { inicio, fim } = intervaloDoMes(mes)
  const { data } = await supabase.rpc('metricas_painel', { p_inicio: inicio, p_fim: fim })
  return { ...VAZIO, ...((data as Partial<MetricasPainel> | null) ?? {}) }
}

/** Indicadores do mês atual comparados ao mês anterior. */
export async function metricasComparadas() {
  const mes = mesAtual()
  const [atual, anterior] = await Promise.all([metricasDoMes(mes), metricasDoMes(somarMeses(mes, -1))])
  return { mes, atual, anterior }
}

export type SemanaReceita = { semana: string; valores: Partial<Record<CanalVenda, number>>; total: number }

/** Receita por semana e canal (últimas N semanas, inclusive as sem vendas). */
export async function receitaSemanal(semanas = 12): Promise<SemanaReceita[]> {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.rpc('receita_semanal', { p_semanas: semanas })

  const porSemana = new Map<string, SemanaReceita>()
  for (const linha of data ?? []) {
    const chave = String(linha.semana).slice(0, 10)
    const semana = porSemana.get(chave) ?? { semana: chave, valores: {}, total: 0 }
    semana.valores[linha.canal] = Number(linha.total)
    semana.total += Number(linha.total)
    porSemana.set(chave, semana)
  }

  // Preenche semanas vazias (segunda-feira de cada semana).
  const hoje = new Date()
  const segunda = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()))
  segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7))
  return Array.from({ length: semanas }, (_, i) => {
    const d = new Date(segunda)
    d.setUTCDate(d.getUTCDate() - (semanas - 1 - i) * 7)
    const chave = d.toISOString().slice(0, 10)
    return porSemana.get(chave) ?? { semana: chave, valores: {}, total: 0 }
  })
}

export async function pendenciasDeCobranca() {
  const { supabase } = await exigirEquipe()
  const [naoCobrados, aguardando] = await Promise.all([
    supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('status_pagamento', 'pendente').neq('status', 'cancelado'),
    supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('status_pagamento', 'cobrado').neq('status', 'cancelado'),
  ])
  return { naoCobrados: naoCobrados.count ?? 0, aguardando: aguardando.count ?? 0 }
}

export async function preVendasEncerrando() {
  const { supabase } = await exigirEquipe()
  const agora = new Date()
  const limite = new Date(agora.getTime() + 48 * 3_600_000)
  const { data } = await supabase
    .from('pre_vendas')
    .select('id, titulo, encerra_em')
    .eq('status', 'ativa')
    .gt('encerra_em', agora.toISOString())
    .lte('encerra_em', limite.toISOString())
    .order('encerra_em')
  return data ?? []
}

export async function atividadesRecentes() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('atividades')
    .select('id, tipo, descricao, criado_em, cliente_id, pedido_id, clientes(nome)')
    .order('criado_em', { ascending: false })
    .limit(7)
  return data ?? []
}

export async function pedidosRecentes() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('vw_pedidos').select('*').order('criado_em', { ascending: false }).limit(6)
  return data ?? []
}
