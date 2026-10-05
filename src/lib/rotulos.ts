import type {
  CanalVenda,
  OrigemCliente,
  StatusPagamento,
  StatusPedido,
  StatusAtendimento,
  StatusPreVenda,
} from '@/types'

/** Textos e tons de cor de cada valor de enum, usados em badges e filtros. */

export type Tom =
  | 'volt'
  | 'neutro'
  | 'escuro'
  | 'shopify'
  | 'app'
  | 'vip'
  | 'whatsapp'
  | 'sucesso'
  | 'alerta'
  | 'perigo'

export const CANAIS: Record<CanalVenda, { rotulo: string; tom: Tom }> = {
  grupo_vip: { rotulo: 'Grupo VIP', tom: 'vip' },
  whatsapp: { rotulo: 'WhatsApp', tom: 'whatsapp' },
  loja: { rotulo: 'Loja', tom: 'neutro' },
  shopify: { rotulo: 'Shopify', tom: 'shopify' },
  app: { rotulo: 'App', tom: 'app' },
}

export const STATUS_PAGAMENTO: Record<StatusPagamento, { rotulo: string; tom: Tom }> = {
  pendente: { rotulo: 'Pendente', tom: 'alerta' },
  cobrado: { rotulo: 'Cobrado', tom: 'shopify' },
  pago: { rotulo: 'Pago', tom: 'sucesso' },
  estornado: { rotulo: 'Estornado', tom: 'perigo' },
}

export const STATUS_PEDIDO: Record<StatusPedido, { rotulo: string; tom: Tom }> = {
  novo: { rotulo: 'Novo', tom: 'volt' },
  confirmado: { rotulo: 'Confirmado', tom: 'shopify' },
  separado: { rotulo: 'Separado', tom: 'app' },
  entregue: { rotulo: 'Entregue', tom: 'sucesso' },
  cancelado: { rotulo: 'Cancelado', tom: 'perigo' },
}

export const STATUS_PRE_VENDA: Record<StatusPreVenda, { rotulo: string; tom: Tom }> = {
  rascunho: { rotulo: 'Rascunho', tom: 'neutro' },
  ativa: { rotulo: 'Ativa', tom: 'volt' },
  encerrada: { rotulo: 'Encerrada', tom: 'escuro' },
}

export const ORIGEM_CLIENTE: Record<OrigemCliente, { rotulo: string; tom: Tom }> = {
  manual: { rotulo: 'Manual', tom: 'neutro' },
  pre_venda: { rotulo: 'Pré-venda', tom: 'volt' },
  shopify: { rotulo: 'Shopify', tom: 'shopify' },
  app: { rotulo: 'App', tom: 'app' },
  importacao: { rotulo: 'Importação', tom: 'neutro' },
}

export const STATUS_ATENDIMENTO: Record<StatusAtendimento, { rotulo: string; tom: Tom }> = {
  fila: { rotulo: 'Na fila', tom: 'alerta' },
  em_atendimento: { rotulo: 'Em atendimento', tom: 'shopify' },
  aguardando_cliente: { rotulo: 'Aguardando cliente', tom: 'app' },
  resolvido: { rotulo: 'Resolvido', tom: 'sucesso' },
}

export const SITUACAO_CONTA: Record<string, { rotulo: string; tom: Tom }> = {
  paga: { rotulo: 'Paga', tom: 'sucesso' },
  cancelada: { rotulo: 'Cancelada', tom: 'neutro' },
  vencida: { rotulo: 'Vencida', tom: 'perigo' },
  vence_logo: { rotulo: 'Vence logo', tom: 'alerta' },
  em_dia: { rotulo: 'Em dia', tom: 'neutro' },
}

export const SITUACAO_RECEBIMENTO: Record<string, { rotulo: string; tom: Tom }> = {
  recebida: { rotulo: 'Recebida', tom: 'sucesso' },
  cancelada: { rotulo: 'Cancelada', tom: 'neutro' },
  vencida: { rotulo: 'Atrasada', tom: 'perigo' },
  vence_logo: { rotulo: 'Vence logo', tom: 'alerta' },
  em_dia: { rotulo: 'Em dia', tom: 'neutro' },
}

export const FORMAS_PAGAMENTO = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto']

/** Situação do relacionamento a partir do último pedido. */
export function situacaoCliente(ultimoPedidoEm: string | null, diasSemComprar: number | null) {
  if (!ultimoPedidoEm || diasSemComprar === null) return { rotulo: 'Sem pedidos', tom: 'neutro' as Tom }
  if (diasSemComprar <= 60) return { rotulo: 'Ativo', tom: 'sucesso' as Tom }
  if (diasSemComprar <= 120) return { rotulo: 'Em risco', tom: 'alerta' as Tom }
  return { rotulo: 'Inativo', tom: 'neutro' as Tom }
}
