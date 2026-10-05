/**
 * Apelidos dos tipos do banco usados no app.
 * A fonte da verdade é `database.types.ts` (gerado com `npm run db:types`).
 */
import type { Database, Enums, Tables } from './database.types'

export type { Database, Json } from './database.types'

// Tabelas
export type Perfil = Tables<'perfis'>
export type Configuracoes = Tables<'configuracoes'>
export type Fornecedor = Tables<'fornecedores'>
export type Vendedor = Tables<'vendedores'>
export type ContaFixa = Tables<'contas_fixas'>
export type ContaPagar = Tables<'contas_pagar'>
export type ContaReceber = Tables<'contas_receber'>
export type CategoriaFinanceira = Tables<'categorias_financeiras'>
export type PastaLeads = Tables<'leads_pastas'>
export type ListaLeads = Tables<'leads_listas'>
export type Lead = Tables<'leads'>
export type Cliente = Tables<'clientes'>
export type Produto = Tables<'produtos'>
export type PreVenda = Tables<'pre_vendas'>
export type PreVendaItem = Tables<'pre_venda_itens'>
export type Pedido = Tables<'pedidos'>
export type PedidoItem = Tables<'pedido_itens'>
export type Atividade = Tables<'atividades'>
export type Webhook = Tables<'webhooks'>
export type EventoIntegracao = Tables<'eventos_integracao'>
export type ContatoWhatsapp = Tables<'whatsapp_contatos'>
export type Atendimento = Tables<'atendimentos'>
export type MensagemWhatsapp = Tables<'whatsapp_mensagens'>
export type EventoAtendimento = Tables<'atendimento_eventos'>

// Visões
export type ClienteResumo = Tables<'vw_clientes'>
export type PedidoResumo = Tables<'vw_pedidos'>
export type PreVendaResumo = Tables<'vw_pre_vendas'>
export type PreVendaItemDetalhe = Tables<'vw_pre_venda_itens'>
export type ContaPagarDetalhe = Tables<'vw_contas_pagar'>
export type ContaReceberDetalhe = Tables<'vw_contas_receber'>
export type LeadDetalhe = Tables<'vw_leads'>
export type PastaLeadsResumo = Tables<'vw_leads_pastas'>
export type AtendimentoResumo = Tables<'vw_atendimentos'>

// Enums
export type CanalVenda = Enums<'canal_venda'>
export type StatusPedido = Enums<'status_pedido'>
export type StatusPagamento = Enums<'status_pagamento'>
export type StatusPreVenda = Enums<'status_pre_venda'>
export type SituacaoFrete = Enums<'situacao_frete'>
export type StatusConta = Enums<'status_conta'>
export type TipoConta = Enums<'tipo_conta'>
export type StatusRecebimento = Enums<'status_recebimento'>
export type NaturezaFinanceira = Enums<'natureza_financeira'>
export type OrigemCliente = Enums<'origem_cliente'>
export type OrigemPedido = Enums<'origem_pedido'>
export type PapelUsuario = Enums<'papel_usuario'>
export type StatusAtendimento = Enums<'status_atendimento'>
export type StatusMensagemWhatsapp = Enums<'status_mensagem_whatsapp'>

export type MetricasPainel = {
  receita: number
  pedidos: number
  ticket_medio: number
  recebido: number
  a_receber: number
  pedidos_a_receber: number
  clientes: number
  clientes_novos: number
  clientes_vip: number
  pre_vendas_ativas: number
}

export type FuncaoRetorno<F extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][F]['Returns']
