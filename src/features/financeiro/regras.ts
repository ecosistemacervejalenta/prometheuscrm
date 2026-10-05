import { somarMesesData } from '@/lib/datas'

/**
 * Regras puras do financeiro, usadas tanto no servidor (Server Actions) quanto
 * no navegador (prévia do parcelamento nos formulários).
 */

/** Valor do <select> de categoria que abre o campo "Nova categoria". */
export const NOVA_CATEGORIA = '__nova__'

/** Ordem alfabética (pt-BR), com "Outros" sempre por último. */
export function ordenarCategorias(nomes: string[]): string[] {
  return [...new Set(nomes)].sort((a, b) => {
    if (a === 'Outros') return 1
    if (b === 'Outros') return -1
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  })
}

export type ModoValor = 'total' | 'parcela'

/**
 * Divide um total em parcelas de centavos inteiros.
 * A diferença do arredondamento fica na 1ª parcela: R$ 100 em 3x → 33,34 + 33,33 + 33,33.
 */
export function dividirEmParcelas(total: number, parcelas: number): number[] {
  const emCentavos = Math.round(total * 100)
  const base = Math.floor(emCentavos / parcelas)
  const resto = emCentavos - base * parcelas
  return Array.from({ length: parcelas }, (_, i) => (base + (i === 0 ? resto : 0)) / 100)
}

/**
 * Lançamentos de um parcelamento, um por mês a partir do 1º vencimento.
 * `modo = 'total'` divide o valor; `modo = 'parcela'` repete o valor em cada mês.
 */
export function gerarParcelas({
  descricao,
  valor,
  modo,
  parcelas,
  vencimento,
}: {
  descricao: string
  valor: number
  modo: ModoValor
  parcelas: number
  vencimento: string
}) {
  const valores = modo === 'total' ? dividirEmParcelas(valor, parcelas) : Array<number>(parcelas).fill(valor)
  return valores.map((valorParcela, i) => {
    const venc = somarMesesData(vencimento, i)
    return {
      descricao: parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao,
      valor: valorParcela,
      vencimento: venc,
      competencia: `${venc.slice(0, 7)}-01`,
    }
  })
}
