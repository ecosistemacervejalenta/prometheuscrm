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
  /** Produto na Olist (o histórico fica ligado a ele). */
  olist_id: number
  /** Última falha ao ler a Olist (nula depois de uma leitura que deu certo). */
  leitura_erro: string | null
  leitura_erro_em: string | null
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

const CAMPOS = 'id, sku, nome, foto_url, estoque_olist, estoque_lido_em, olist_id, leitura_erro, leitura_erro_em, lotes(id, lote, validade, quantidade)'

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

export type TipoMovimento =
  | 'cadastro'
  | 'ajuste'
  | 'edicao'
  | 'baixa_olist'
  | 'exclusao'
  | 'leitura_olist'
  | 'falha_leitura'
  | 'cerveja_cadastrada'
  | 'cerveja_atualizada'
  | 'cerveja_removida'
  | 'alerta_grupo'
  | 'tratativa'

export type MovimentoDoLote = {
  id: number
  tipo: TipoMovimento
  lote: string | null
  quantidade: number | null
  saldo: number | null
  estoque_antes: number | null
  estoque_depois: number | null
  /** rotina | aviso_olist | botao | salvar_lote | cadastro | conferencia | manual | alteracao_direta */
  origem: string | null
  /** O que mudou, campo a campo, e outras informações do evento. */
  detalhes: Record<string, unknown>
  /** Papel no banco de quem mudou (authenticated, service_role, none). */
  papel: string | null
  sku: string | null
  criado_em: string
  autor: string | null
}

/** Quantos eventos a tela mostra de cara (o resto, em "Ver histórico completo"). */
export const HISTORICO_RESUMIDO = 30
const HISTORICO_COMPLETO = 2000

/**
 * Histórico do produto, do mais novo para o mais antigo (eventos do mesmo instante na ordem em
 * que aconteceram: a leitura antes das baixas que ela causou). Pelo id do produto na Olist, para
 * incluir o que aconteceu antes de a cerveja sair e voltar ao controle.
 */
export async function listarHistoricoDoProduto(
  olistId: number,
  completo = false,
): Promise<{ movimentos: MovimentoDoLote[]; total: number }> {
  const { supabase } = await exigirEquipe()
  const { data, error, count } = await supabase
    .from('lote_movimentos')
    .select('id, tipo, lote, quantidade, saldo, estoque_antes, estoque_depois, origem, detalhes, papel, sku, criado_em, perfis(nome)', { count: 'exact' })
    .eq('olist_id', olistId)
    .order('criado_em', { ascending: false })
    .order('id', { ascending: true })
    .limit(completo ? HISTORICO_COMPLETO : HISTORICO_RESUMIDO)
  // Sem o histórico (ex.: migration ainda não aplicada) a tela continua funcionando.
  if (error) {
    console.error('[lotes] histórico', error.message)
    return { movimentos: [], total: 0 }
  }
  return {
    total: count ?? data.length,
    movimentos: data.map((m) => ({
      id: m.id,
      tipo: m.tipo as TipoMovimento,
      lote: m.lote,
      quantidade: m.quantidade,
      saldo: m.saldo,
      estoque_antes: m.estoque_antes === null ? null : Number(m.estoque_antes),
      estoque_depois: m.estoque_depois === null ? null : Number(m.estoque_depois),
      origem: m.origem,
      detalhes: m.detalhes && typeof m.detalhes === 'object' && !Array.isArray(m.detalhes) ? (m.detalhes as Record<string, unknown>) : {},
      papel: m.papel,
      sku: m.sku,
      criado_em: m.criado_em,
      autor: m.perfis?.nome ?? null,
    })),
  }
}

// -----------------------------------------------------------------------------
// Avisos no grupo e tratativas
// -----------------------------------------------------------------------------

/** Como está a entrega do aviso ao n8n (que posta no grupo). */
export type EntregaDoAviso = 'aguardando' | 'na_fila' | 'tentando' | 'entregue' | 'falhou' | 'sem_webhook'

export type TratativaDoAviso = { id: string; texto: string; criado_em: string; autor: string | null }

export type AvisoDoLote = {
  id: string
  lote_id: string | null
  cerveja_id: string | null
  cerveja_nome: string
  sku: string | null
  lote: string
  validade: string
  quantidade: number | null
  faixa: 'alerta' | 'atencao' | 'critico'
  /** Dias que faltavam quando o aviso foi criado. */
  dias: number
  teste: boolean
  criado_em: string
  entrega: EntregaDoAviso
  erroEntrega: string | null
  /** Da mais antiga para a mais nova. */
  tratativas: TratativaDoAviso[]
}

const CAMPOS_AVISO =
  'id, lote_id, cerveja_id, cerveja_nome, sku, lote, validade, quantidade, faixa, dias, teste, criado_em, ' +
  'evento:eventos_integracao!lote_alertas_evento_id_fkey(status, tentativas, ultimo_erro), ' +
  'lote_tratativas(id, texto, criado_em, perfis(nome))'

type LinhaAviso = {
  id: string
  lote_id: string | null
  cerveja_id: string | null
  cerveja_nome: string
  sku: string | null
  lote: string
  validade: string
  quantidade: number | null
  faixa: string
  dias: number
  teste: boolean
  criado_em: string
  evento: { status: string; tentativas: number; ultimo_erro: string | null } | null
  lote_tratativas: Array<{ id: string; texto: string; criado_em: string; perfis: { nome: string | null } | null }>
}

function paraAviso(a: LinhaAviso): AvisoDoLote {
  const entrega: EntregaDoAviso = !a.evento
    ? 'aguardando'
    : a.evento.status === 'enviado'
      ? 'entregue'
      : a.evento.status === 'ignorado'
        ? 'sem_webhook'
        : a.evento.status === 'erro'
          ? 'falhou'
          : a.evento.tentativas > 0
            ? 'tentando'
            : 'na_fila'
  return {
    id: a.id,
    lote_id: a.lote_id,
    cerveja_id: a.cerveja_id,
    cerveja_nome: a.cerveja_nome,
    sku: a.sku,
    lote: a.lote,
    validade: a.validade,
    quantidade: a.quantidade,
    faixa: a.faixa as AvisoDoLote['faixa'],
    dias: a.dias,
    teste: a.teste,
    criado_em: a.criado_em,
    entrega,
    erroEntrega: a.evento?.ultimo_erro ?? null,
    tratativas: [...a.lote_tratativas]
      .sort((x, y) => x.criado_em.localeCompare(y.criado_em))
      .map((t) => ({ id: t.id, texto: t.texto, criado_em: t.criado_em, autor: t.perfis?.nome ?? null })),
  }
}

/** Últimos avisos mandados ao grupo (inclusive os de teste). */
export async function listarAvisos(limite = 100): Promise<AvisoDoLote[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('lote_alertas').select(CAMPOS_AVISO).order('criado_em', { ascending: false }).limit(limite)
  if (error) {
    console.error('[lotes] avisos', error.message)
    return []
  }
  return (data as unknown as LinhaAviso[]).map(paraAviso)
}

export async function obterAviso(id: string): Promise<AvisoDoLote | null> {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('lote_alertas').select(CAMPOS_AVISO).eq('id', id).maybeSingle()
  return data ? paraAviso(data as unknown as LinhaAviso) : null
}

/** Aviso mais recente (de verdade, não teste) de cada lote. */
export async function avisosDosLotes(loteIds: string[]): Promise<Record<string, AvisoDoLote>> {
  if (loteIds.length === 0) return {}
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('lote_alertas')
    .select(CAMPOS_AVISO)
    .in('lote_id', loteIds)
    .eq('teste', false)
    .order('criado_em', { ascending: false })
  if (error) {
    console.error('[lotes] avisos dos lotes', error.message)
    return {}
  }
  const porLote: Record<string, AvisoDoLote> = {}
  for (const a of (data as unknown as LinhaAviso[]).map(paraAviso)) if (a.lote_id && !porLote[a.lote_id]) porLote[a.lote_id] = a
  return porLote
}

/** Avisos ligados? E existe webhook ativo levando os avisos ao n8n? */
export async function configuracaoDosAvisos(): Promise<{ ativo: boolean; webhook: 'ok' | 'pausado' | 'ausente' }> {
  const { supabase } = await exigirEquipe()
  const [{ data: config }, { data: webhooks }] = await Promise.all([
    supabase.from('configuracoes').select('lotes_aviso_grupo').eq('id', 1).maybeSingle(),
    supabase.from('webhooks').select('ativo, eventos'),
  ])
  const recebem = (webhooks ?? []).filter((w) => w.eventos.includes('*') || w.eventos.includes('lote.alerta_validade'))
  return {
    ativo: config?.lotes_aviso_grupo ?? true,
    webhook: recebem.some((w) => w.ativo) ? 'ok' : recebem.length ? 'pausado' : 'ausente',
  }
}
