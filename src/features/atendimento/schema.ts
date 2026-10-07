import { z } from 'zod'

import { checkbox, textoOpcional } from '@/lib/validacao'

const limite = (max: number) => (v: string | null) => v === null || v.length <= max

export const esquemaMensagem = z
  .string({ error: 'Escreva a mensagem.' })
  .trim()
  .min(1, 'Escreva a mensagem.')
  .max(4000, 'Mensagem longa demais (máximo de 4.000 caracteres).')

export const esquemaNota = z
  .string({ error: 'Escreva a nota.' })
  .trim()
  .min(1, 'Escreva a nota.')
  .max(4000, 'Nota longa demais (máximo de 4.000 caracteres).')

/** Arquivo já enviado pelo navegador para o bucket (em <contato>/envios/). */
export const esquemaMidia = z.object({
  caminho: z.string().regex(/^[0-9a-f-]{36}\/envios\/[\w-]{1,80}\.[a-z0-9]{1,8}$/i, 'Arquivo inválido.'),
  tipo: z.enum(['imagem', 'video', 'audio', 'documento']),
  mime: z.string().max(120).nullable(),
  nome: z.string().trim().max(200).nullable(),
  segundos: z.number().int().min(0).max(3600).nullable(),
  gravado: z.boolean(),
  legenda: z.string().trim().max(1000, 'Legenda longa demais (máximo de 1.000 caracteres).').nullable(),
})

export type DadosMidia = z.infer<typeof esquemaMidia>

export const esquemaContato = z.object({
  nome: textoOpcional.refine(limite(80), 'Use no máximo 80 caracteres.'),
  anotacoes: textoOpcional.refine(limite(2000), 'Use no máximo 2.000 caracteres.'),
})

export const esquemaStatus = z.enum(['fila', 'em_atendimento', 'aguardando_cliente', 'resolvido'])

/** Paleta das etiquetas (mesma lista do check no banco e dos tokens etiqueta-* do globals.css). */
export const CORES_ETIQUETA = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'cinza'] as const

export type CorEtiqueta = (typeof CORES_ETIQUETA)[number]

export type Etiqueta = { id: string; nome: string; cor: CorEtiqueta }

export const esquemaEtiqueta = z.object({
  nome: z
    .string({ error: 'Dê um nome à etiqueta.' })
    .trim()
    .transform((v) => v.replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'Dê um nome à etiqueta.').max(40, 'Use no máximo 40 caracteres.')),
  cor: z.enum(CORES_ETIQUETA, { error: 'Escolha uma cor.' }),
})

/** Nome que aparece em negrito no início da mensagem (*Ana Souza:* ...). */
export const esquemaNomeAssinatura = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Informe o nome.').max(60, 'Use no máximo 60 caracteres por nome.'))

/** Lista "Assinar como": um nome por linha, sem repetir. */
const listaNomesAssinatura = z.preprocess(
  (v) =>
    String(v ?? '')
      .split('\n')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
  z
    .array(z.string())
    .max(30, 'Cadastre no máximo 30 nomes.')
    .refine((nomes) => nomes.every((n) => n.length <= 60), 'Use no máximo 60 caracteres por nome.')
    .transform((nomes) => nomes.filter((n, i) => nomes.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)),
)

export const esquemaConfigAtendimento = z.object({
  whatsapp_assinatura: checkbox,
  whatsapp_nomes_assinatura: listaNomesAssinatura,
  whatsapp_leads_automatico: checkbox,
  whatsapp_pasta_leads_id: z.preprocess((v) => (v ? v : null), z.uuid('Escolha uma pasta.').nullable()),
})
