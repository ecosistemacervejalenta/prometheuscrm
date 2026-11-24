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

/** Unidades do lote: número inteiro ("1200" ou "1.200"). */
const quantidade = (minimo: number) =>
  z.preprocess(
    (v) => {
      const digitado = typeof v === 'string' ? v.trim().replace(/\./g, '') : ''
      return /^\d+$/.test(digitado) ? Number(digitado) : undefined
    },
    z
      .number({ error: 'Informe a quantidade.' })
      .min(minimo, 'A quantidade deve ser maior que zero.')
      .max(1_000_000, 'Quantidade alta demais.'),
  )

export const esquemaSku = z.object({
  sku: texto('Informe o SKU da cerveja.').max(60, 'O SKU pode ter no máximo 60 caracteres.'),
})

/** Quantos lotes dá para cadastrar de uma vez na mesma cerveja. */
export const MAX_LOTES_POR_VEZ = 30

const camposDoLote = {
  lote: texto('Informe o lote.').max(60, 'O lote pode ter no máximo 60 caracteres.'),
  validade: z.string({ error: 'Informe a validade.' }).refine(dataValida, 'Informe a validade.'),
}

/** Lote novo: a quantidade é obrigatória e maior que zero. */
export const esquemaLote = z.object({ ...camposDoLote, quantidade: quantidade(1) })

/** Edição: aceita zero (o lote acabou, mas o registro fica). */
export const esquemaLoteEditado = z.object({ ...camposDoLote, quantidade: quantidade(0) })
