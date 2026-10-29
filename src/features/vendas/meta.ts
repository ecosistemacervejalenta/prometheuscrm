import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { hojeISO, somarDias, somarMeses } from '@/lib/datas'

import type { Vendas } from './serie'

/** Desde quando procurar o maior mês (antes disso não há vendas no sistema). */
const INICIO_DO_HISTORICO = '2020-01-01'
/** Meses fechados exibidos no histórico de metas. */
const MESES_NO_HISTORICO = 6
/** Meta geral: a marca mensal que a equipe quer alcançar, além de superar o mês anterior. */
export const META_GERAL = 120_000

export type MesFaturado = Vendas & { mes: string }

export type MetaMensal = {
  /** "AAAA-MM" do mês corrente. */
  mes: string
  atual: Vendas
  /** Meta do mês = faturamento do mês anterior (0 quando não houve vendas). */
  meta: number
  /** Positivo = quanto falta; negativo = quanto já passou da meta. */
  falta: number
  /** Meta geral do mês (META_GERAL). */
  metaGeral: number
  /** Dias até o fim do mês, contando hoje (1 = hoje é o último dia). */
  diasRestantes: number
  /** Este mês já é o maior faturamento da história. */
  recorde: boolean
  /** Maior mês antes deste (null sem histórico). */
  melhorMes: MesFaturado | null
  /** Últimos meses fechados, do mais recente ao mais antigo, com a meta de cada um. */
  historico: Array<MesFaturado & { meta: number; batida: boolean }>
}

const ultimoDiaDoMes = (mes: string) => somarDias(`${somarMeses(mes, 1)}-01`, -1)

/**
 * Meta do mês corrente (o faturamento do mês anterior), quanto falta ou quanto já
 * passou, os dias restantes e se o mês já é recorde. Mesma regra do painel
 * "Vendas por canal" (função faturamento_por_mes no banco).
 */
export async function metaDoMes(): Promise<MetaMensal> {
  const { supabase } = await exigirEquipe()
  const hoje = hojeISO()
  const mes = hoje.slice(0, 7)
  const { data, error } = await supabase.rpc('faturamento_por_mes', { p_inicio: INICIO_DO_HISTORICO, p_fim: hoje })
  if (error) throw error

  const porMes = new Map<string, MesFaturado>(
    (data ?? []).map((l) => {
      const chave = String(l.mes).slice(0, 7)
      return [chave, { mes: chave, valor: Number(l.valor), pedidos: Number(l.pedidos) }]
    }),
  )
  const valorDe = (m: string) => porMes.get(m)?.valor ?? 0

  const atual = porMes.get(mes) ?? { mes, valor: 0, pedidos: 0 }
  const meta = valorDe(somarMeses(mes, -1))
  const anteriores = [...porMes.values()].filter((m) => m.mes < mes && m.valor > 0)
  const melhorMes = anteriores.reduce<MesFaturado | null>((melhor, m) => (!melhor || m.valor > melhor.valor ? m : melhor), null)

  const historico = Array.from({ length: MESES_NO_HISTORICO }, (_, i) => somarMeses(mes, -(i + 1)))
    .filter((m) => valorDe(somarMeses(m, -1)) > 0)
    .map((m) => {
      const metaMes = valorDe(somarMeses(m, -1))
      return { mes: m, valor: valorDe(m), pedidos: porMes.get(m)?.pedidos ?? 0, meta: metaMes, batida: valorDe(m) >= metaMes }
    })

  return {
    mes,
    atual: { valor: atual.valor, pedidos: atual.pedidos },
    meta,
    falta: meta - atual.valor,
    metaGeral: META_GERAL,
    diasRestantes: Number(ultimoDiaDoMes(mes).slice(8)) - Number(hoje.slice(8)) + 1,
    recorde: melhorMes !== null && atual.valor > melhorMes.valor,
    melhorMes,
    historico,
  }
}
