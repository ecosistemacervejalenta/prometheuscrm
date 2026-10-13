import { z } from 'zod'

import { localParaISO } from '@/lib/datas'

export const STATUS = ['a_fazer', 'fazendo', 'concluida'] as const
export const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'] as const

/** Atalhos do quadro (pílulas acima das colunas). */
export const SITUACOES = ['atrasadas', 'impedidas', 'sem_prazo'] as const
export type SituacaoFiltro = (typeof SITUACOES)[number]

export const BUCKET_TAREFAS = 'tarefas'
export const MAX_IMAGENS_POR_ENVIO = 10

export const esquemaStatus = z.enum(STATUS, { error: 'Status inválido.' })
export const esquemaPrioridade = z.enum(PRIORIDADES, { error: 'Escolha a prioridade.' })

const titulo = z
  .string({ error: 'Dê um título para a tarefa.' })
  .trim()
  .min(1, 'Dê um título para a tarefa.')
  .max(160, 'Use no máximo 160 caracteres no título.')

const descricao = z
  .string()
  .trim()
  .max(10000, 'Descrição longa demais (máximo de 10.000 caracteres).')
  .transform((v) => v || null)
  .nullable()

/** Valor do <input type="datetime-local"> (horário de Brasília) → ISO; vazio = sem prazo. */
const prazo = z
  .string()
  .nullable()
  .transform((v) => (v ? localParaISO(v) : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), 'Data e hora inválidas.')

export const esquemaNovaTarefa = z.object({
  titulo,
  descricao,
  prioridade: esquemaPrioridade,
  prazo,
  status: esquemaStatus,
  responsaveis: z.array(z.uuid('Responsável inválido.')).min(1, 'Marque pelo menos um responsável.').max(30),
})

export type DadosNovaTarefa = z.input<typeof esquemaNovaTarefa>

/** Edição de um campo por vez, direto no cartão aberto. */
export const esquemaEdicao = z
  .object({ titulo, descricao, prioridade: esquemaPrioridade, prazo })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nada para salvar.')

export type DadosEdicao = z.input<typeof esquemaEdicao>

export const esquemaComentario = z
  .string({ error: 'Escreva o comentário.' })
  .trim()
  .min(1, 'Escreva o comentário.')
  .max(4000, 'Comentário longo demais (máximo de 4.000 caracteres).')

export const esquemaMotivo = z
  .string({ error: 'Conte o que está impedindo a tarefa.' })
  .trim()
  .min(3, 'Conte o que está impedindo a tarefa.')
  .max(2000, 'Use no máximo 2.000 caracteres.')

/** Imagem já enviada pelo navegador para o bucket (em <tarefa_id>/). */
export const esquemaAnexo = z.object({
  caminho: z.string().regex(/^[0-9a-f-]{36}\/[\w-]{1,80}\.(jpg|png|webp|gif)$/i, 'Arquivo inválido.'),
  nome: z.string().trim().min(1).max(200),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif'], { error: 'Só imagens JPG, PNG, WEBP ou GIF.' }),
  tamanho: z.number().int().min(1).max(10 * 1024 * 1024, 'Cada imagem pode ter no máximo 10 MB.'),
  largura: z.number().int().positive().nullable(),
  altura: z.number().int().positive().nullable(),
})

export type DadosAnexo = z.infer<typeof esquemaAnexo>
