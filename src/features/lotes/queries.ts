import 'server-only'

import { exigirEquipe } from '@/lib/auth'

import { situacaoValidade } from './validade'

export type LoteDaCerveja = { id: string; lote: string; validade: string }

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
  vencidos: number
  venceLogo: number
}

export const FILTROS_LOTES = ['vencidos', 'vence_logo', 'sem_lote'] as const
export type FiltroLotes = (typeof FILTROS_LOTES)[number]

const CAMPOS = 'id, sku, nome, foto_url, estoque_olist, estoque_lido_em, lotes(id, lote, validade)'

type Linha = Omit<CervejaComLotes, 'vencidos' | 'venceLogo'>

function paraCerveja(linha: Linha): CervejaComLotes {
  const lotes = [...linha.lotes].sort((a, b) => a.validade.localeCompare(b.validade) || a.lote.localeCompare(b.lote))
  const situacoes = lotes.map((l) => situacaoValidade(l.validade).situacao)
  return {
    ...linha,
    estoque_olist: linha.estoque_olist === null ? null : Number(linha.estoque_olist),
    lotes,
    vencidos: situacoes.filter((s) => s === 'vencido').length,
    venceLogo: situacoes.filter((s) => s === 'vence_logo').length,
  }
}

/** Todas as cervejas do controle: primeiro as de validade mais próxima; sem lote por último. */
export async function listarCervejasDosLotes(): Promise<CervejaComLotes[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('lotes_cervejas').select(CAMPOS).order('nome')
  if (error) throw error
  return data.map(paraCerveja).sort((a, b) => {
    const [va, vb] = [a.lotes[0]?.validade, b.lotes[0]?.validade]
    if (va && vb) return va.localeCompare(vb) || a.nome.localeCompare(b.nome, 'pt-BR')
    if (va || vb) return va ? -1 : 1
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
}

export async function obterCervejaDosLotes(id: string): Promise<CervejaComLotes | null> {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('lotes_cervejas').select(CAMPOS).eq('id', id).maybeSingle()
  return data ? paraCerveja(data) : null
}

export function resumoDosLotes(cervejas: CervejaComLotes[]) {
  return {
    cervejas: cervejas.length,
    lotes: cervejas.reduce((s, c) => s + c.lotes.length, 0),
    // Contagens em cervejas (as mesmas linhas que cada filtro mostra).
    vencidos: cervejas.filter((c) => c.vencidos > 0).length,
    venceLogo: cervejas.filter((c) => c.venceLogo > 0).length,
    semLote: cervejas.filter((c) => c.lotes.length === 0).length,
  }
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Filtra por situação e por texto (nome, SKU ou código do lote; todas as palavras precisam aparecer). */
export function filtrarCervejas(cervejas: CervejaComLotes[], { busca, filtro }: { busca?: string; filtro?: FiltroLotes }) {
  const palavras = busca ? semAcento(busca).split(/\s+/).filter(Boolean) : []
  return cervejas.filter((c) => {
    if (filtro === 'vencidos' && c.vencidos === 0) return false
    if (filtro === 'vence_logo' && c.venceLogo === 0) return false
    if (filtro === 'sem_lote' && c.lotes.length > 0) return false
    if (palavras.length === 0) return true
    const texto = semAcento([c.nome, c.sku, ...c.lotes.map((l) => l.lote)].join(' '))
    return palavras.every((p) => texto.includes(p))
  })
}
