import 'server-only'

import { cache } from 'react'

import { lerKit } from '@/features/produtos/kit'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Dados da página pública /p/{slug}. Usa a chave secreta (não há login),
 * por isso devolve SOMENTE o necessário para o cliente montar o pedido e pagar.
 */
export const obterPreVendaPublica = cache(async (slug: string) => {
  const db = createAdminClient()
  const { data: preVenda } = await db
    .from('vw_pre_vendas')
    .select('id, titulo, descricao, slug, canal, status, status_efetivo, encerra_em, previsao_entrega')
    .eq('slug', slug)
    .maybeSingle()

  if (!preVenda?.id || preVenda.status === 'rascunho') return null

  const [{ data: itens }, { data: loja }, { data: mercadoPago }] = await Promise.all([
    db
      .from('vw_pre_venda_itens')
      .select('produto_id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, imagem_url, fotos, cervejas_do_kit, preco, limite_por_cliente, restante, ordem')
      .eq('pre_venda_id', preVenda.id)
      .order('ordem'),
    db
      .from('configuracoes')
      .select('nome_loja, whatsapp_loja, chave_pix, nome_recebedor_pix, whatsapp_comprovante, frete_vip_valor')
      .eq('id', 1)
      .maybeSingle(),
    db.from('integracao_mercado_pago').select('conta_id').eq('id', 1).maybeSingle(),
  ])

  return {
    preVenda: {
      titulo: preVenda.titulo ?? '',
      descricao: preVenda.descricao,
      slug: preVenda.slug ?? slug,
      grupoVip: preVenda.canal === 'grupo_vip',
      ativa: preVenda.status_efetivo === 'ativa',
      encerra_em: preVenda.encerra_em,
      previsao_entrega: preVenda.previsao_entrega,
    },
    itens: (itens ?? []).map((i) => ({
      produto_id: i.produto_id ?? '',
      nome: i.nome ?? '',
      estilo: i.estilo,
      cervejaria: i.cervejaria,
      volume_ml: i.volume_ml,
      teor_alcoolico: i.teor_alcoolico === null ? null : Number(i.teor_alcoolico),
      descricao: i.descricao,
      imagem_url: i.imagem_url,
      fotos: i.fotos?.length ? i.fotos : i.imagem_url ? [i.imagem_url] : [],
      cervejas_do_kit: lerKit(i.cervejas_do_kit),
      preco: Number(i.preco ?? 0),
      limite_por_cliente: i.limite_por_cliente,
      restante: i.restante,
    })),
    loja: {
      nome: loja?.nome_loja ?? 'Prometheus',
      whatsapp: loja?.whatsapp_loja ?? null,
      pix: loja?.chave_pix ? { chave: loja.chave_pix, favorecido: loja.nome_recebedor_pix } : null,
      whatsappComprovante: loja?.whatsapp_comprovante ?? loja?.whatsapp_loja ?? null,
      freteVip: Number(loja?.frete_vip_valor ?? 15),
      /** PIX automático (QR Code + copia e cola com baixa sozinha) pelo Mercado Pago. */
      mercadoPago: Boolean(mercadoPago?.conta_id),
    },
  }
})

export type PreVendaPublica = NonNullable<Awaited<ReturnType<typeof obterPreVendaPublica>>>

/**
 * Página pública /pagar/{id}: o essencial para o cliente pagar um pedido (restante do frete
 * cotado, pedido manual, cobrança enviada pela equipe). Identificado só pelo UUID do pedido.
 */
export const obterPedidoParaPagar = cache(async (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const db = createAdminClient()
  const [{ data: pedido }, { data: loja }, { data: mercadoPago }] = await Promise.all([
    db
      .from('pedidos')
      .select('id, numero, total, subtotal, taxa_entrega, status, status_pagamento, frete, clientes(nome), pre_vendas(titulo), pedido_itens(descricao, quantidade, total)')
      .eq('id', id)
      .maybeSingle(),
    db
      .from('configuracoes')
      .select('nome_loja, whatsapp_loja, chave_pix, nome_recebedor_pix, whatsapp_comprovante')
      .eq('id', 1)
      .maybeSingle(),
    db.from('integracao_mercado_pago').select('conta_id').eq('id', 1).maybeSingle(),
  ])
  if (!pedido) return null

  return {
    pedido: {
      id: pedido.id,
      numero: pedido.numero,
      total: Number(pedido.total),
      taxaEntrega: Number(pedido.taxa_entrega),
      frete: pedido.frete,
      cancelado: pedido.status === 'cancelado',
      pago: pedido.status_pagamento === 'pago',
      clienteNome: pedido.clientes?.nome ?? '',
      preVendaTitulo: pedido.pre_vendas?.titulo ?? null,
      itens: pedido.pedido_itens.map((i) => ({ nome: i.descricao, quantidade: i.quantidade, total: Number(i.total) })),
    },
    loja: {
      nome: loja?.nome_loja ?? 'Prometheus',
      pix: loja?.chave_pix ? { chave: loja.chave_pix, favorecido: loja.nome_recebedor_pix } : null,
      whatsappComprovante: loja?.whatsapp_comprovante ?? loja?.whatsapp_loja ?? null,
      mercadoPago: Boolean(mercadoPago?.conta_id),
    },
  }
})

export type PedidoParaPagar = NonNullable<Awaited<ReturnType<typeof obterPedidoParaPagar>>>
