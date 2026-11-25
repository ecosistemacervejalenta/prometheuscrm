import { z } from 'zod'

import { texto } from '@/lib/validacao'

/** "AAAA-MM-DD" de um dia que existe (2000–2100). */
function dataValida(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const data = new Date(`${valor}T12:00:00Z`)
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) return false
  const ano = data.getUTCFullYear()
  return ano >= 2000 && ano <= 2100
}

/**
 * Unidades do lote: número inteiro ("1200" ou "1.200"). Só é obrigatória quando a cerveja tem
 * mais de um lote; com um lote só, em branco = o estoque da Olist.
 */
function quantidade({ minimo, obrigatoria }: { minimo: number; obrigatoria: boolean }) {
  const numero = z
    .number({ error: obrigatoria ? 'Com mais de um lote, informe a quantidade.' : 'Use só números.' })
    .min(minimo, 'A quantidade deve ser maior que zero.')
    .max(1_000_000, 'Quantidade alta demais.')
  return z.preprocess(
    (v) => {
      const digitado = typeof v === 'string' ? v.trim().replace(/\./g, '') : ''
      if (digitado === '') return obrigatoria ? undefined : null
      return /^\d+$/.test(digitado) ? Number(digitado) : undefined
    },
    obrigatoria ? numero : numero.nullable(),
  )
}

export const esquemaSku = z.object({
  sku: texto('Informe o SKU da cerveja.').max(60, 'O SKU pode ter no máximo 60 caracteres.'),
})

/** Quantos lotes dá para cadastrar de uma vez na mesma cerveja. */
export const MAX_LOTES_POR_VEZ = 30

const camposDoLote = {
  lote: texto('Informe o lote.').max(60, 'O lote pode ter no máximo 60 caracteres.'),
  validade: z.string({ error: 'Informe a validade.' }).refine(dataValida, 'Informe a validade.'),
}

/**
 * Lote + validade (+ quantidade).
 *   • variosLotes: a cerveja fica com mais de um lote → a quantidade de cada um é obrigatória.
 *   • edicao: aceita zero (o lote acabou, mas o registro fica).
 */
export const esquemaLote = ({ variosLotes, edicao = false }: { variosLotes: boolean; edicao?: boolean }) =>
  z.object({ ...camposDoLote, quantidade: quantidade({ minimo: edicao ? 0 : 1, obrigatoria: variosLotes }) })
