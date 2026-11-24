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

export const esquemaSku = z.object({
  sku: texto('Informe o SKU da cerveja.').max(60, 'O SKU pode ter no máximo 60 caracteres.'),
})

/** Quantos lotes dá para cadastrar de uma vez na mesma cerveja. */
export const MAX_LOTES_POR_VEZ = 30

export const esquemaLote = z.object({
  lote: texto('Informe o lote.').max(60, 'O lote pode ter no máximo 60 caracteres.'),
  validade: z.string({ error: 'Informe a validade.' }).refine(dataValida, 'Informe a validade.'),
})
