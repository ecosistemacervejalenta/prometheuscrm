import { z } from 'zod'

import { hojeISO } from '@/lib/datas'
import { data, dinheiroOpcional, texto, textoOpcional, whatsappOpcional } from '@/lib/validacao'

import { TIPOS_CHAVE_PIX } from './rotulos'

/** Validação (zod) dos formulários do programa de influenciadores — CRM e Portal. */

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** "12,5" | "12.5" | "12,5 %" → 12.5 */
const percentual = (minimo: number, mensagem: string) =>
  z.preprocess(
    (v) => (vazio(v) ? undefined : Number(String(v).replace(/[%\s]/g, '').replace(',', '.'))),
    z
      .number({ error: mensagem })
      .min(minimo, mensagem)
      .max(100, 'O máximo é 100%.')
      .transform((n) => Math.round(n * 100) / 100),
  )

/** Aceita "@nome", "nome" ou o link do perfil; guarda só o nome de usuário. */
const instagramOpcional = z.preprocess(
  (v) => {
    if (vazio(v)) return null
    const bruto = String(v).trim().toLowerCase()
    const doLink = /instagram\.com\/([a-z0-9._]+)/.exec(bruto)?.[1]
    return (doLink ?? bruto).replace(/^@+/, '').replace(/\/+$/, '')
  },
  z
    .string()
    .regex(/^[a-z0-9._]{1,30}$/, 'Use só o nome de usuário do Instagram (ex.: @lucervejeira).')
    .nullable(),
)

const documentoOpcional = z.preprocess(
  (v) => (vazio(v) ? null : String(v).replace(/\D/g, '')),
  z
    .string()
    .regex(/^(\d{11}|\d{14})$/, 'Informe um CPF (11 números) ou CNPJ (14 números).')
    .nullable(),
)

const tipoChavePixOpcional = z.preprocess(
  (v) => (vazio(v) ? null : String(v)),
  z.enum(Object.keys(TIPOS_CHAVE_PIX) as [keyof typeof TIPOS_CHAVE_PIX, ...Array<keyof typeof TIPOS_CHAVE_PIX>], 'Escolha o tipo da chave.').nullable(),
)

const camposPix = {
  tipo_chave_pix: tipoChavePixOpcional,
  chave_pix: z.preprocess((v) => (vazio(v) ? null : String(v).trim()), z.string().max(140, 'Chave PIX grande demais.').nullable()),
  nome_recebedor: z.preprocess((v) => (vazio(v) ? null : String(v).trim()), z.string().max(120, 'Nome grande demais.').nullable()),
  documento: documentoOpcional,
}

/** Tipo e chave andam juntos: ou os dois, ou nenhum. */
function conferirPix(d: { tipo_chave_pix: string | null; chave_pix: string | null }, ctx: z.RefinementCtx) {
  if (d.chave_pix && !d.tipo_chave_pix) ctx.addIssue({ code: 'custom', path: ['tipo_chave_pix'], message: 'Escolha o tipo da chave PIX.' })
  if (d.tipo_chave_pix && !d.chave_pix) ctx.addIssue({ code: 'custom', path: ['chave_pix'], message: 'Informe a chave PIX.' })
}

const camposComuns = {
  nome: texto('Informe o nome.').max(120, 'Nome grande demais.'),
  email: z.preprocess((v) => (vazio(v) ? '' : String(v).trim().toLowerCase()), z.email('Informe um e-mail válido (é o login do Portal).')),
  whatsapp: whatsappOpcional,
  instagram: instagramOpcional,
  desconto_percentual: percentual(1, 'Informe o desconto do cupom (de 1 a 100%).'),
  comissao_percentual: percentual(0, 'Informe a comissão (de 0 a 100%).'),
  contar_desde: data('Informe a partir de quando as vendas contam.').refine((d) => d <= hojeISO(), 'A data não pode ser no futuro.'),
  observacoes: z.preprocess((v) => (vazio(v) ? null : String(v).trim()), z.string().max(4000, 'Texto grande demais.').nullable()),
  ...camposPix,
}

/** Cadastro: inclui o cupom (depois de criado ele não muda). */
export const esquemaNovoInfluenciador = z
  .object({
    ...camposComuns,
    cupom: z.preprocess(
      (v) => (vazio(v) ? '' : String(v).trim().toUpperCase()),
      z.string().regex(/^[A-Z0-9]{3,20}$/, 'Use de 3 a 20 letras e números, sem espaços nem acentos (ex.: LU10).'),
    ),
  })
  .superRefine(conferirPix)

export const esquemaEditarInfluenciador = z.object(camposComuns).superRefine(conferirPix)

/** Repasse: ajuste (+/−) opcional, com motivo quando houver. */
export const esquemaPagamento = z
  .object({
    pago_em: data('Informe a data do repasse.').refine((d) => d <= hojeISO(), 'A data não pode ser no futuro.'),
    ajuste_valor: dinheiroOpcional,
    ajuste_sentido: z.enum(['somar', 'descontar']).catch('descontar'),
    ajuste_motivo: textoOpcional,
    observacoes: z.preprocess((v) => (vazio(v) ? null : String(v).trim()), z.string().max(2000, 'Texto grande demais.').nullable()),
  })
  .superRefine((d, ctx) => {
    if (d.ajuste_valor > 0 && !d.ajuste_motivo) ctx.addIssue({ code: 'custom', path: ['ajuste_motivo'], message: 'Explique o ajuste (o influenciador vê este texto).' })
  })

/** Regras do programa (Ajustes). */
export const esquemaRegras = z.object({
  influ_comissao_padrao: percentual(0, 'Informe a comissão padrão (de 0 a 100%).'),
  influ_desconto_padrao: percentual(1, 'Informe o desconto padrão (de 1 a 100%).'),
  influ_carencia_dias: z.preprocess(
    (v) => (vazio(v) ? undefined : Number(String(v).replace(/\D/g, ''))),
    z.number({ error: 'Informe os dias de carência.' }).int().min(0, 'Informe os dias de carência.').max(120, 'O máximo é 120 dias.'),
  ),
  influ_nome_loja: z.preprocess((v) => (vazio(v) ? null : String(v).trim()), z.string().max(80, 'Nome grande demais.').nullable()),
  influ_loja_url: z.preprocess(
    (v) => {
      if (vazio(v)) return null
      const bruto = String(v).trim().replace(/\/+$/, '')
      return /^https?:\/\//i.test(bruto) ? bruto.replace(/^http:\/\//i, 'https://') : `https://${bruto}`
    },
    z
      .string()
      .regex(/^https:\/\/[^\s/]+$/, 'Use só o endereço da loja, sem caminho (ex.: https://loja.com.br).')
      .nullable(),
  ),
  influ_regras: z.preprocess((v) => (vazio(v) ? null : String(v).trim()), z.string().max(4000, 'Texto grande demais.').nullable()),
})

/** Portal › Minha conta: contato e PIX. */
export const esquemaContaPortal = z
  .object({
    whatsapp: whatsappOpcional,
    instagram: instagramOpcional,
    ...camposPix,
  })
  .superRefine(conferirPix)

export const esquemaSenhaPortal = z
  .object({
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, { message: 'As senhas não conferem.', path: ['confirmacao'] })
