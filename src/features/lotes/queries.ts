import 'server-only'

import { exigirEquipe } from '@/lib/auth'

import { SITUACOES_VALIDADE, situacaoValidade, type SituacaoValidade } from './validade'

export type LoteDaCerveja = {
  id: string
  lote: string
  validade: string
  /**
   * Unidades do lote. Baixa sozinha quando o estoque da Olist cai (do lote que vence primeiro).
   * null = falta informar (a Olist não deu o estoque quando o lote foi cadastrado).
   */
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
  /** Soma das quantidades dos lotes. */
  nosLotes: number
  /**
   * Unidades da Olist que ainda não estão em lote nenhum (entrou mercadoria). null = não dá
   * para saber (a Olist não informou o estoque, ou há lote sem quantidade).
   */
  semLote: number | null
  /** Lotes ainda sem quantidade. */
  lotesSemQuantidade: number
}

/** Um lote com a cerveja dele — a linha da lista do módulo. */
export type LoteComCerveja = LoteDaCerveja & {
  situacao: SituacaoValidade
  cerveja: Pick<CervejaComLotes, 'id' | 'sku' | 'nome' | 'foto_url' | 'estoque_olist' | 'estoque_lido_em'>
}

export const FILTROS_LOTES = [...SITUACOES_VALIDADE.map((s) => s.chave), 'sem_lote'] as const
export type FiltroLotes = (typeof FILTROS_LOTES)[number]

const CAMPOS = 'id, sku, nome, foto_url, estoque_olist, estoque_lido_em, lotes(id, lote, validade, quantidade)'

type Linha = Omit<CervejaComLotes, 'nosLotes' | 'semLote' | 'lotesSemQuantidade'>

/** Soma dos lotes e unidades sem lote (o banco garante que a soma dos lotes não passa do estoque). */
function paraCerveja(linha: Linha): CervejaComLotes {
  const estoque = linha.estoque_olist === null ? null : Number(linha.estoque_olist)
  const nosLotes = linha.lotes.reduce((soma, l) => soma + (l.quantidade ?? 0), 0)
  const lotesSemQuantidade = linha.lotes.filter((l) => l.quantidade === null).length
  return {
    ...linha,
    estoque_olist: estoque,
    lotes: [...linha.lotes].sort((a, b) => a.validade.localeCompare(b.validade) || a.lote.localeCompare(b.lote)),
    nosLotes,
    lotesSemQuantidade,
    semLote: estoque === null || lotesSemQuantidade > 0 ? null : Math.max(Math.floor(estoque) - nosLotes, 0),
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

/**
 * Lotes que ainda têm unidades (ou sem quantidade informada), do que vence primeiro para o que
 * vence por último. Lote esgotado (0 un.) fica só na tela da cerveja: não corre risco de vencer.
 */
export function lotesPorValidade(cervejas: CervejaComLotes[]): LoteComCerveja[] {
  return cervejas
    .flatMap(({ lotes, id, sku, nome, foto_url, estoque_olist, estoque_lido_em }) =>
      lotes.filter((lote) => lote.quantidade !== 0).map((lote) => ({
        ...lote,
        situacao: situacaoValidade(lote.validade).situacao,
        cerveja: { id, sku, nome, foto_url, estoque_olist, estoque_lido_em },
      })),
    )
    .sort((a, b) => a.validade.localeCompare(b.validade) || a.cerveja.nome.localeCompare(b.cerveja.nome, 'pt-BR') || a.lote.localeCompare(b.lote))
}

export type ContagemLotes = { lotes: number; unidades: number }

/** Soma lotes e unidades (lote com a quantidade por informar conta como lote, com 0 unidade). */
export function contarLotes(lotes: Array<{ quantidade: number | null }>): ContagemLotes {
  return { lotes: lotes.length, unidades: lotes.reduce((soma, l) => soma + (l.quantidade ?? 0), 0) }
}

export type ResumoDosLotes = {
  cervejas: number
  /** Cervejas com unidades sem lote (ou sem nenhum lote cadastrado). */
  semLote: number
  /** Unidades da Olist que ainda não estão em lote nenhum, somando todas as cervejas. */
  unidadesSemLote: number
  total: ContagemLotes
  porSituacao: Record<SituacaoValidade, ContagemLotes>
}

/** Números do painel: lotes e unidades no total e em cada faixa de validade. */
export function resumoDosLotes(cervejas: CervejaComLotes[]): ResumoDosLotes {
  const lotes = lotesPorValidade(cervejas)
  return {
    cervejas: cervejas.length,
    semLote: cervejas.filter(precisaDeLote).length,
    unidadesSemLote: cervejas.reduce((soma, c) => soma + (c.semLote ?? 0), 0),
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

/** A cerveja não tem lote nenhum, ou tem unidades na Olist que ainda não estão em lote. */
function precisaDeLote(c: CervejaComLotes) {
  return c.lotes.length === 0 || (c.semLote ?? 0) > 0
}

/** Cervejas sem lote nenhum ou com unidades da Olist ainda sem lote. */
export function cervejasSemLote(cervejas: CervejaComLotes[], busca?: string) {
  return cervejas.filter((c) => precisaDeLote(c) && contem(busca, c.nome, c.sku))
}

export type MovimentoDoLote = {
  id: number
  lote: string
  tipo: 'cadastro' | 'ajuste' | 'baixa_olist' | 'exclusao'
  quantidade: number
  saldo: number | null
  estoque_antes: number | null
  estoque_depois: number | null
  criado_em: string
  autor: string | null
}

/** Últimos movimentos dos lotes da cerveja (cadastro, ajuste, baixa pela Olist, exclusão). */
export async function listarMovimentosDaCerveja(cervejaId: string, limite = 20): Promise<MovimentoDoLote[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('lote_movimentos')
    .select('id, lote, tipo, quantidade, saldo, estoque_antes, estoque_depois, criado_em, perfis(nome)')
    .eq('cerveja_id', cervejaId)
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(limite)
  // Sem o histórico (ex.: migration ainda não aplicada) a tela continua funcionando.
  if (error) {
    console.error('[lotes] histórico', error.message)
    return []
  }
  return data.map((m) => ({
    id: m.id,
    lote: m.lote,
    tipo: m.tipo as MovimentoDoLote['tipo'],
    quantidade: m.quantidade,
    saldo: m.saldo,
    estoque_antes: m.estoque_antes === null ? null : Number(m.estoque_antes),
    estoque_depois: m.estoque_depois === null ? null : Number(m.estoque_depois),
    criado_em: m.criado_em,
    autor: m.perfis?.nome ?? null,
  }))
}
