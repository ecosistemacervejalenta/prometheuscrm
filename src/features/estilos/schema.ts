import { z } from 'zod'

import { TIPOS_DE_COLECAO, type TipoColecao } from './classificacao'

/** Filtros da tela Clientes › Por estilo (todos na URL, para compartilhar e voltar). */

export const PERIODOS = [
  { valor: '', rotulo: 'Desde sempre', dias: null },
  { valor: '30', rotulo: 'Últimos 30 dias', dias: 30 },
  { valor: '90', rotulo: 'Últimos 90 dias', dias: 90 },
  { valor: '180', rotulo: 'Últimos 6 meses', dias: 180 },
  { valor: '365', rotulo: 'Último ano', dias: 365 },
] as const

export const SEM_COMPRA = [
  { valor: '', rotulo: 'Comprou a qualquer momento', dias: null },
  { valor: '30', rotulo: 'Sem comprar há 30+ dias', dias: 30 },
  { valor: '60', rotulo: 'Sem comprar há 60+ dias', dias: 60 },
  { valor: '90', rotulo: 'Sem comprar há 90+ dias', dias: 90 },
  { valor: '180', rotulo: 'Sem comprar há 6+ meses', dias: 180 },
] as const

export type Periodo = (typeof PERIODOS)[number]['valor']
export type SemCompra = (typeof SEM_COMPRA)[number]['valor']

/** Até 50 collections por público (o ID da Shopify só tem números). */
export const MAX_COLECOES = 50

export type FiltroPublico = { colecoes: string[]; periodo: Periodo; semCompra: SemCompra; tipo: Exclude<TipoColecao, 'ignorar'> }

const umValor = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export function lerFiltro(params: Record<string, string | string[] | undefined>): FiltroPublico {
  const colecoes = [...new Set(umValor(params.c).split(',').map((c) => c.trim()).filter((c) => /^\d{1,20}$/.test(c)))].slice(0, MAX_COLECOES)
  const periodo = PERIODOS.find((p) => p.valor === umValor(params.periodo))?.valor ?? ''
  const semCompra = SEM_COMPRA.find((s) => s.valor === umValor(params.sem))?.valor ?? ''
  const tipo = (['estilo', 'cervejaria', 'tema'] as const).find((t) => t === umValor(params.ver)) ?? 'estilo'
  return { colecoes, periodo, semCompra, tipo }
}

/** Endereço da tela com os filtros (vazios ficam de fora). */
export function hrefDoFiltro(filtro: Partial<FiltroPublico>, base = '/clientes/por-estilo'): string {
  const p = new URLSearchParams()
  if (filtro.colecoes?.length) p.set('c', filtro.colecoes.join(','))
  if (filtro.periodo) p.set('periodo', filtro.periodo)
  if (filtro.semCompra) p.set('sem', filtro.semCompra)
  if (filtro.tipo && filtro.tipo !== 'estilo') p.set('ver', filtro.tipo)
  const q = p.toString()
  return q ? `${base}?${q}` : base
}

/** Data de início do período (ISO) ou null (desde sempre). */
export function desdeDoPeriodo(periodo: Periodo, agora = Date.now()): string | null {
  const dias = PERIODOS.find((p) => p.valor === periodo)?.dias
  return dias ? new Date(agora - dias * 86_400_000).toISOString() : null
}

export const diasSemCompra = (semCompra: SemCompra) => SEM_COMPRA.find((s) => s.valor === semCompra)?.dias ?? null

/** Nome sugerido para a lista: "Compraram Stout + Porter · últimos 90 dias". */
export function nomeSugerido(titulos: string[], periodo: Periodo, semCompra: SemCompra): string {
  const quem = titulos.length <= 3 ? titulos.join(' + ') : `${titulos.slice(0, 3).join(' + ')} e mais ${titulos.length - 3}`
  const partes = [`Compraram ${quem}`]
  if (periodo) partes.push(PERIODOS.find((p) => p.valor === periodo)!.rotulo.toLowerCase())
  if (semCompra) partes.push(SEM_COMPRA.find((s) => s.valor === semCompra)!.rotulo.toLowerCase())
  return partes.join(' · ').slice(0, 110)
}

export const esquemaLista = z.object({
  nome: z.string().trim().min(1, 'Dê um nome para a lista.').max(110, 'Use no máximo 110 caracteres.'),
  colecoes: z.array(z.string().regex(/^\d{1,20}$/)).min(1, 'Escolha ao menos uma collection.').max(MAX_COLECOES),
  periodo: z.enum(PERIODOS.map((p) => p.valor) as [Periodo, ...Periodo[]]),
  semCompra: z.enum(SEM_COMPRA.map((s) => s.valor) as [SemCompra, ...SemCompra[]]),
})

export const esquemaTipo = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  tipo: z.enum(TIPOS_DE_COLECAO.map((t) => t.valor) as [TipoColecao, ...TipoColecao[]]),
})
