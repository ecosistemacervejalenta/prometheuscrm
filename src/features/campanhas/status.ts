import type { Tom } from '@/lib/rotulos'
import type { StatusCampanha } from '@/types'

/** Texto e cor de cada situação da campanha (badges da lista e do detalhe). */
export const STATUS_CAMPANHA: Record<StatusCampanha, { rotulo: string; tom: Tom }> = {
  preparando: { rotulo: 'Incompleta', tom: 'neutro' },
  aguardando_aprovacao: { rotulo: 'Em análise na Meta', tom: 'alerta' },
  agendada: { rotulo: 'Agendada', tom: 'shopify' },
  enviando: { rotulo: 'Enviando', tom: 'volt' },
  pausada: { rotulo: 'Pausada', tom: 'alerta' },
  concluida: { rotulo: 'Concluída', tom: 'sucesso' },
  recusada: { rotulo: 'Recusada pela Meta', tom: 'perigo' },
  cancelada: { rotulo: 'Cancelada', tom: 'neutro' },
  falhou: { rotulo: 'Não enviada', tom: 'perigo' },
}

/** Situações em que a tela da campanha se atualiza sozinha. */
export const STATUS_EM_ANDAMENTO: StatusCampanha[] = ['aguardando_aprovacao', 'agendada', 'enviando']

/** Situações que ainda podem ser pausadas ou canceladas. */
export const STATUS_ATIVOS: StatusCampanha[] = ['aguardando_aprovacao', 'agendada', 'enviando']

/** Situações que podem ser excluídas (nada foi ou será enviado). */
export const STATUS_EXCLUIVEIS: StatusCampanha[] = ['preparando', 'recusada', 'falhou', 'cancelada']

/** Palavras que, sozinhas numa resposta, contam como pedido para sair. */
const PALAVRAS_SAIR = [
  'sair',
  'parar',
  'pare',
  'stop',
  'cancelar',
  'descadastrar',
  'remover',
  'nao quero receber',
  'nao quero mais',
  'sair da lista',
  'me tira da lista',
  'me tire da lista',
]

export function pedidoParaSair(texto: string | null | undefined): boolean {
  const t = (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return PALAVRAS_SAIR.includes(t)
}

/** Situação exibida: campanha enviando mas parada no limite diário ou na avaliação da Meta aparece como espera. */
export function situacaoDaCampanha(c: { status: StatusCampanha | null; pausada_motivo: string | null }) {
  if (c.status === 'enviando' && c.pausada_motivo === 'limite') return { rotulo: 'Esperando o limite diário', tom: 'alerta' as Tom }
  if (c.status === 'enviando' && c.pausada_motivo === 'retida') return { rotulo: 'Em avaliação pela Meta', tom: 'alerta' as Tom }
  return STATUS_CAMPANHA[c.status ?? 'preparando']
}

/** "37%" (ou "—" sem base). */
export function percentual(parte: number | null, total: number | null): string {
  return total ? `${Math.round(((parte ?? 0) / total) * 100)}%` : '—'
}

/** Situação do modelo (mensagem) na Meta. */
export const STATUS_MODELO: Record<string, { rotulo: string; tom: Tom }> = {
  PENDING: { rotulo: 'Em análise', tom: 'alerta' },
  APPROVED: { rotulo: 'Aprovada', tom: 'sucesso' },
  REJECTED: { rotulo: 'Recusada', tom: 'perigo' },
  PAUSED: { rotulo: 'Pausada pela Meta', tom: 'alerta' },
  DISABLED: { rotulo: 'Desativada pela Meta', tom: 'perigo' },
}
