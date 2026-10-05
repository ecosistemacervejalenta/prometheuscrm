import { z } from 'zod'

/**
 * Kit: um produto com várias cervejas dentro (podem ser de marcas diferentes).
 * Só descritivo — o kit é vendido como um item, com um preço.
 */
export type CervejaDoKit = {
  nome: string
  cervejaria: string | null
  estilo: string | null
  teor_alcoolico: number | null
  volume_ml: number | null
  quantidade: number
  descricao: string | null
}

export const MAX_CERVEJAS_NO_KIT = 12
export const MAX_FOTOS = 10

const textoCurto = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null), z.string().nullable())
const numeroOuNulo = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))), z.number().nullable())

export const esquemaCervejaDoKit = z.object({
  nome: z.string({ error: 'Dê um nome a cada cerveja do kit.' }).trim().min(1, 'Dê um nome a cada cerveja do kit.').max(120),
  cervejaria: textoCurto(80),
  estilo: textoCurto(80),
  teor_alcoolico: numeroOuNulo.refine((v) => v === null || (v >= 0 && v <= 99), 'Teor inválido.'),
  volume_ml: numeroOuNulo.refine((v) => v === null || (Number.isInteger(v) && v > 0 && v < 100000), 'Volume inválido.'),
  quantidade: z.preprocess((v) => Number(v) || 1, z.number().int().min(1).max(99)),
  descricao: textoCurto(500),
})

export const esquemaKit = z.array(esquemaCervejaDoKit).max(MAX_CERVEJAS_NO_KIT, `No máximo ${MAX_CERVEJAS_NO_KIT} cervejas por kit.`)

/** JSON do banco → lista do kit (itens inválidos são ignorados, para nunca quebrar o link). */
export function lerKit(valor: unknown): CervejaDoKit[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    const lido = esquemaCervejaDoKit.safeParse(item)
    return lido.success ? [lido.data] : []
  })
}
