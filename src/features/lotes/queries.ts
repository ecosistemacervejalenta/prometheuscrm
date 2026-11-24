import 'server-only'

import { exigirEquipe } from '@/lib/auth'

import { SITUACOES_VALIDADE, situacaoValidade, type SituacaoValidade } from './validade'

export type LoteDaCerveja = {
  id: string
  lote: string
  validade: string
  /** Unidades do lote (null = lote antigo, cadastrado antes de existir a quantidade). */
  quantidade: number | null
}

export type CervejaComLotes = {
  id: string
  sku: string
  nome: string
  foto_url: string | null
  /** Unidades em estoque na Olist na última leitura (null = a Olist não informou). */
  estoque_olist: number | null
  estoque_lido_em: string | null
  /** Da validade mais próxima para a mais distante. */
  lotes: LoteDaCerveja[]
}

/** Um lote com a cerveja dele — a linha da lista do módulo. */
export type LoteComCerveja = LoteDaCerveja & {
  situacao: SituacaoValidade
  cerveja: Pick<CervejaComLotes, 'id' | 'sku' | 'nome' | 'foto_url' | 'estoque_olist'>
}

export const FILTROS_LOTES = [...SITUACOES_VALIDADE.map((s) => s.chave), 'sem_lote'] as const
export type FiltroLotes = (typeof FILTROS_LOTES)[number]

const CAMPOS = 'id, sku, nome, foto_url, estoque_olist, estoque_lido_em, lotes(id, lote, validade, quantidade)'

function paraCerveja(linha: CervejaComLotes): CervejaComLotes {
  return {
    ...linha,
    estoque_olist: linha.estoque_olist === null ? null : Number(linha.estoque_olist),
    lotes: [...linha.lotes].sort((a, b) => a.validade.localeCompare(b.validade) || a.lote.localeCompare(b.lote)),
  }
}

/** Todas as cervejas do controle, em ordem alfabética, cada uma com os lotes dela. */
export async function listarCervejasDosLotes(): Promise<CervejaComLotes[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('lotes_cervejas').select(CAMPOS).order('nome')
  if (error) throw error
  return data.map(paraCerveja)
}

export async function obterCervejaDosLotes(id: string): Promise<CervejaComLotes | null> {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('lotes_cervejas').select(CAMPOS).eq('id', id).maybeSingle()
  return data ? paraCerveja(data) : null
}

/** Todos os lotes, do que vence primeiro para o que vence por último. */
export function lotesPorValidade(cervejas: CervejaComLotes[]): LoteComCerveja[] {
  return cervejas
    .flatMap(({ lotes, id, sku, nome, foto_url, estoque_olist }) =>
      lotes.map((lote) => ({ ...lote, situacao: situacaoValidade(lote.validade).situacao, cerveja: { id, sku, nome, foto_url, estoque_olist } })),
    )
    .sort((a, b) => a.validade.localeCompare(b.validade) || a.cerveja.nome.localeCompare(b.cerveja.nome, 'pt-BR') || a.lote.localeCompare(b.lote))
}

export type ContagemLotes = { lotes: number; unidades: number }

/** Soma lotes e unidades (lote sem quantidade informada conta como lote, com 0 unidade). */
export function contarLotes(lotes: Array<{ quantidade: number | null }>): ContagemLotes {
  return { lotes: lotes.length, unidades: lotes.reduce((soma, l) => soma + (l.quantidade ?? 0), 0) }
}

export type ResumoDosLotes = {
  cervejas: number
  semLote: number
  total: ContagemLotes
  porSituacao: Record<SituacaoValidade, ContagemLotes>
}

/** Números do painel: lotes e unidades no total e em cada faixa de validade. */
export function resumoDosLotes(cervejas: CervejaComLotes[]): ResumoDosLotes {
  const lotes = lotesPorValidade(cervejas)
  return {
    cervejas: cervejas.length,
    semLote: cervejas.filter((c) => c.lotes.length === 0).length,
    total: contarLotes(lotes),
    porSituacao: Object.fromEntries(
      SITUACOES_VALIDADE.map(({ chave }) => [chave, contarLotes(lotes.filter((l) => l.situacao === chave))]),
    ) as Record<SituacaoValidade, ContagemLotes>,
  }
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Todas as palavras da busca precisam aparecer no texto (sem diferenciar acentos nem maiúsculas). */
function contem(busca: string | undefined, ...textos: string[]) {
  const palavras = busca ? semAcento(busca).split(/\s+/).filter(Boolean) : []
  if (palavras.length === 0) return true
  const texto = semAcento(textos.join(' '))
  return palavras.every((p) => texto.includes(p))
}

/** Lotes de uma faixa de validade (ou todos), filtrados por nome da cerveja, SKU ou código do lote. */
export function filtrarLotes(lotes: LoteComCerveja[], { busca, situacao }: { busca?: string; situacao?: SituacaoValidade }) {
  return lotes.filter((l) => (!situacao || l.situacao === situacao) && contem(busca, l.cerveja.nome, l.cerveja.sku, l.lote))
}

/** Cervejas cadastradas que ainda não têm nenhum lote. */
export function cervejasSemLote(cervejas: CervejaComLotes[], busca?: string) {
  return cervejas.filter((c) => c.lotes.length === 0 && contem(busca, c.nome, c.sku))
}
