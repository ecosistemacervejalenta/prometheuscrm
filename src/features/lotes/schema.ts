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

/** "1200" ou "1.200" → 1200; vazio → null; outra coisa → undefined (inválido). */
function lerQuantidade(v: unknown): number | null | undefined {
  const digitado = typeof v === 'string' ? v.trim().replace(/\./g, '') : ''
  if (digitado === '') return null
  return /^\d+$/.test(digitado) ? Number(digitado) : undefined
}

const unidades = (minimo: number, mensagem: string) =>
  z
    .number({ error: mensagem })
    .min(minimo, minimo > 0 ? 'A quantidade deve ser maior que zero.' : 'A quantidade não pode ser negativa.')
    .max(1_000_000, 'Quantidade alta demais.')

/** Cadastro: em branco = o lote recebe as unidades da Olist que ainda não têm lote. */
const quantidadeOpcional = z.preprocess(lerQuantidade, unidades(1, 'Use só números.').nullable())
/** Edição: obrigatória e aceita zero (o lote acabou, mas o registro fica). */
const quantidadeObrigatoria = z.preprocess((v) => lerQuantidade(v) ?? undefined, unidades(0, 'Informe a quantidade.'))

/** Código bipado no leitor (EAN) ou SKU digitado. */
export const esquemaCodigo = z.object({
  codigo: texto('Bipe o código de barras ou digite o SKU da cerveja.').max(60, 'O código pode ter no máximo 60 caracteres.'),
})

/**
 * O código tem cara de código de barras (EAN-8, UPC-A, EAN-13 ou GTIN-14: só dígitos, com 8,
 * 12, 13 ou 14)? Devolve só os dígitos (espaços e hífens de quem digitou saem), ou null.
 */
export function codigoDeBarras(codigo: string): string | null {
  const digitos = codigo.replace(/[\s-]/g, '')
  return /^(\d{8}|\d{12,14})$/.test(digitos) ? digitos : null
}

/** Quantos lotes dá para cadastrar de uma vez na mesma cerveja. */
export const MAX_LOTES_POR_VEZ = 30

const camposDoLote = {
  lote: texto('Informe o lote.').max(60, 'O lote pode ter no máximo 60 caracteres.'),
  validade: z.string({ error: 'Informe a validade.' }).refine(dataValida, 'Informe a validade.'),
}

/** Lote novo: quantidade em branco = as unidades da Olist que ainda não estão em lote nenhum. */
export const esquemaLoteNovo = z.object({ ...camposDoLote, quantidade: quantidadeOpcional })

/** Edição: a quantidade é obrigatória e aceita zero (o lote acabou, mas o registro fica). */
export const esquemaLoteEditado = z.object({ ...camposDoLote, quantidade: quantidadeObrigatoria })
