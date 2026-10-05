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

export const esquemaContato = z.object({
  nome: textoOpcional.refine(limite(80), 'Use no máximo 80 caracteres.'),
  anotacoes: textoOpcional.refine(limite(2000), 'Use no máximo 2.000 caracteres.'),
})

export const esquemaStatus = z.enum(['fila', 'em_atendimento', 'aguardando_cliente', 'resolvido'])

export const esquemaConfigAtendimento = z.object({
  whatsapp_assinatura: checkbox,
  whatsapp_leads_automatico: checkbox,
  whatsapp_pasta_leads_id: z.preprocess((v) => (v ? v : null), z.uuid('Escolha uma pasta.').nullable()),
})
