import { somarDias } from '@/lib/datas'

import type { IdCanal } from './canais'
import type { Intervalo } from './periodos'

/**
 * Séries temporais do painel "Vendas por canal" (gráfico de evolução).
 * Funções puras: usadas no servidor para montar os pontos e testáveis isoladamente.
 */

export type Vendas = { valor: number; pedidos: number }
export type VendasPorCanal = Partial<Record<IdCanal, Vendas>>
export type Granularidade = 'dia' | 'semana'

export type PontoSerie = {
  /** Primeiro dia do ponto ("AAAA-MM-DD"). */
  inicio: string
  /** Último dia do ponto (igual a `inicio` na granularidade diária). */
  fim: string
  /** Rótulo curto do eixo: "05/09" ou "05/09 – 07/09". */
  rotulo: string
  valores: VendasPorCanal
}

export type Serie = { granularidade: Granularidade; pontos: PontoSerie[] }

/** Acima disso o gráfico agrupa por semana (60 e 90 dias), como o Olist. */
const MAX_DIAS_DIARIO = 45

export const diasNoIntervalo = (i: Intervalo) =>
  Math.round((new Date(`${i.fim}T12:00:00Z`).getTime() - new Date(`${i.inicio}T12:00:00Z`).getTime()) / 86_400_000) + 1

const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

const diasEntre = (de: string, ate: string) =>
  Math.round((new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 86_400_000)

export function somarVendas(a: Vendas | undefined, b: Vendas | undefined): Vendas {
  return { valor: Math.round(((a?.valor ?? 0) + (b?.valor ?? 0)) * 100) / 100, pedidos: (a?.pedidos ?? 0) + (b?.pedidos ?? 0) }
}

/**
 * Pontos do gráfico para o intervalo, um por dia (até 45 dias) ou por semana.
 * Semanas = blocos de 7 dias contados de trás para frente a partir do último dia,
 * como no Olist (ex.: 29/09–05/10, 22/09–28/09…): o ponto mais recente é sempre
 * uma semana completa e só o 1º bloco pode ser parcial — o gráfico não "despenca"
 * no fim por causa de uma semana pela metade.
 * Dias sem venda viram pontos vazios — a linha cai a zero em vez de "pular".
 */
export function montarSerie(intervalo: Intervalo, porDia: Map<string, VendasPorCanal>): Serie {
  const granularidade: Granularidade = diasNoIntervalo(intervalo) > MAX_DIAS_DIARIO ? 'semana' : 'dia'
  const pontos: PontoSerie[] = []

  for (let dia = intervalo.inicio; dia <= intervalo.fim; dia = somarDias(dia, 1)) {
    const inicioDoPonto =
      granularidade === 'dia'
        ? dia
        : [somarDias(intervalo.fim, -(Math.floor(diasEntre(dia, intervalo.fim) / 7) * 7 + 6)), intervalo.inicio].sort().at(-1)!
    let ponto = pontos.at(-1)
    if (!ponto || ponto.inicio !== inicioDoPonto) {
      ponto = { inicio: inicioDoPonto, fim: dia, rotulo: '', valores: {} }
      pontos.push(ponto)
    }
    ponto.fim = dia
    for (const [canal, vendas] of Object.entries(porDia.get(dia) ?? {}) as Array<[IdCanal, Vendas]>) {
      ponto.valores[canal] = somarVendas(ponto.valores[canal], vendas)
    }
  }

  for (const p of pontos) p.rotulo = p.inicio === p.fim ? ddmm(p.inicio) : `${ddmm(p.inicio)} – ${ddmm(p.fim)}`
  return { granularidade, pontos }
}

/** Total por canal somando os pontos da série. */
export function totaisDaSerie(serie: Serie): VendasPorCanal {
  const totais: VendasPorCanal = {}
  for (const ponto of serie.pontos) {
    for (const [canal, vendas] of Object.entries(ponto.valores) as Array<[IdCanal, Vendas]>) {
      totais[canal] = somarVendas(totais[canal], vendas)
    }
  }
  return totais
}
