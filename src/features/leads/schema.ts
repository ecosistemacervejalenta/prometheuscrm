import { z } from 'zod'

import { texto, textoOpcional } from '@/lib/validacao'

const chaveColuna = z.string().regex(/^c\d{1,2}$/, 'Coluna inválida.')
const chaveOpcional = chaveColuna.nullable()
const textoCurto = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max, `Use no máximo ${max} caracteres.`).nullable())

export const esquemaPasta = z.object({
  nome: texto('Dê um nome para a pasta.').max(80, 'Use no máximo 80 caracteres.'),
  descricao: textoOpcional,
})

/** Dados de uma lista nova (o arquivo já foi lido no navegador). */
export const esquemaNovaLista = z
  .object({
    pasta_id: z.uuid('Escolha uma pasta.').nullable(),
    nova_pasta: textoCurto(80),
    nome: texto('Dê um nome para a lista.').max(120, 'Use no máximo 120 caracteres.'),
    origem: textoCurto(60),
    arquivo_nome: textoCurto(200),
    colunas: z
      .array(
        z.object({
          chave: chaveColuna,
          rotulo: texto('Coluna sem nome.').max(120),
          tipo: z.enum(['nome', 'telefone', 'email', 'texto']),
        }),
      )
      .min(1, 'O arquivo não tem colunas com dados.')
      .max(60, 'Máximo de 60 colunas.'),
    coluna_nome: chaveOpcional,
    coluna_whatsapp: chaveOpcional,
    coluna_email: chaveOpcional,
  })
  .refine((d) => d.pasta_id || d.nova_pasta, { path: ['pasta_id'], message: 'Escolha uma pasta ou crie uma nova.' })

/** Um lote de leads (até 1.000 por envio). */
export const esquemaLote = z
  .array(
    z.object({
      linha: z.number().int().min(1).max(1_000_000),
      nome: z.string().max(500).nullable(),
      whatsapp: z.string().max(20).nullable(),
      email: z.string().max(320).nullable(),
      dados: z.record(chaveColuna, z.string().max(500)),
    }),
  )
  .min(1)
  .max(1000)

export const esquemaEdicaoLista = z.object({
  nome: texto('Dê um nome para a lista.').max(120, 'Use no máximo 120 caracteres.'),
  origem: textoCurto(60),
  pasta_id: z.uuid('Escolha uma pasta.'),
})
