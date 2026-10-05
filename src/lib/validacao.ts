import { z } from 'zod'

import { lerDinheiro } from './format'
import { normalizarWhatsapp, whatsappValido } from './whatsapp'

/**
 * Blocos de validação (zod) reutilizados pelos formulários.
 * Os valores chegam do FormData como texto; aqui viram tipos corretos.
 */

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** Texto obrigatório (com mensagem em pt-BR). */
export const texto = (mensagem = 'Campo obrigatório.') => z.string({ error: mensagem }).trim().min(1, mensagem)

/** Texto opcional: string vazia vira null. */
export const textoOpcional = z.preprocess(
  (v) => (vazio(v) ? null : String(v).trim()),
  z.string().nullable(),
)

/** E-mail opcional. */
export const emailOpcional = z.preprocess(
  (v) => (vazio(v) ? null : String(v).trim().toLowerCase()),
  z.email('E-mail inválido.').nullable(),
)

/** WhatsApp opcional, normalizado (5511987654321). */
export const whatsappOpcional = z.preprocess(
  (v) => (vazio(v) ? null : String(v)),
  z
    .string()
    .refine((v) => whatsappValido(v), 'WhatsApp inválido. Use DDD + número.')
    .transform((v) => normalizarWhatsapp(v) as string)
    .nullable(),
)

/** WhatsApp obrigatório, normalizado. */
export const whatsapp = z
  .string({ error: 'Informe o WhatsApp.' })
  .refine((v) => whatsappValido(v), 'WhatsApp inválido. Use DDD + número.')
  .transform((v) => normalizarWhatsapp(v) as string)

/** Maior valor aceito pelas colunas numeric(12, 2) do banco. */
const VALOR_MAXIMO = 9_999_999_999.99
const centavos = (v: number) => Math.round(v * 100) / 100

/** Valor em reais (aceita "1.234,56" e "1.200"), arredondado aos centavos. */
export const dinheiro = (mensagem = 'Informe um valor válido.') =>
  z.preprocess(
    (v) => (vazio(v) ? undefined : lerDinheiro(String(v))),
    z.number({ error: mensagem }).min(0, mensagem).max(VALOR_MAXIMO, 'Valor alto demais.').transform(centavos),
  )

/** Valor em reais opcional (vazio = 0). */
export const dinheiroOpcional = z.preprocess(
  (v) => (vazio(v) ? 0 : lerDinheiro(String(v))),
  z.number({ error: 'Valor inválido.' }).min(0, 'Valor inválido.').max(VALOR_MAXIMO, 'Valor alto demais.').transform(centavos),
)

/** Inteiro opcional. */
export const inteiroOpcional = z.preprocess(
  (v) => (vazio(v) ? null : Number(String(v).replace(/\D/g, ''))),
  z.number().int().nonnegative().nullable(),
)

/** Data "YYYY-MM-DD" opcional. */
export const dataOpcional = z.preprocess(
  (v) => (vazio(v) ? null : String(v)),
  z.iso.date('Data inválida.').nullable(),
)

/** Data "YYYY-MM-DD" obrigatória. */
export const data = (mensagem = 'Informe a data.') => z.iso.date(mensagem)

/** Checkbox HTML ("on" quando marcado). */
export const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())

/** UF com duas letras. */
export const ufOpcional = z.preprocess(
  (v) => (vazio(v) ? null : String(v).trim().toUpperCase()),
  z.string().regex(/^[A-Z]{2}$/, 'UF inválida.').nullable(),
)

/** Lista separada por vírgulas → array (tags, empresas...). */
export const listaPorVirgula = z.preprocess(
  (v) =>
    vazio(v)
      ? []
      : String(v)
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
  z.array(z.string()),
)

export const uuid = z.uuid('Identificador inválido.')

/** Converte FormData em objeto simples. Campos listados em `listas` usam getAll(). */
export function formParaObjeto(formData: FormData, listas: string[] = []): Record<string, unknown> {
  const objeto: Record<string, unknown> = {}
  for (const chave of new Set(formData.keys())) {
    if (chave.startsWith('$ACTION')) continue
    objeto[chave] = listas.includes(chave) ? formData.getAll(chave) : formData.get(chave)
  }
  for (const lista of listas) objeto[lista] ??= []
  return objeto
}
