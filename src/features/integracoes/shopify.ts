import 'server-only'

import { createHmac } from 'node:crypto'

import type { Json } from '@/types'

import { segredosIguais } from './api-auth'

/**
 * Integração Shopify (webhooks).
 * Docs: https://shopify.dev/docs/apps/build/webhooks
 * Tópicos tratados: orders/create, orders/updated, orders/paid, orders/cancelled,
 *                   customers/create, customers/update
 */

/** Valida o header X-Shopify-Hmac-Sha256 (HMAC-SHA256 do corpo bruto, em base64). */
export function assinaturaShopifyValida(corpoBruto: string, hmacRecebido: string | null, segredo: string) {
  if (!hmacRecebido) return false
  const calculado = createHmac('sha256', segredo).update(corpoBruto, 'utf8').digest('base64')
  return segredosIguais(calculado, hmacRecebido)
}

type EnderecoShopify = {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province_code?: string | null
  zip?: string | null
  phone?: string | null
  name?: string | null
}

type ClienteShopify = {
  id?: number | string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  default_address?: EnderecoShopify | null
}

type PedidoShopify = {
  id: number | string
  name?: string
  note?: string | null
  created_at?: string
  financial_status?: string | null
  fulfillment_status?: string | null
  cancelled_at?: string | null
  total_discounts?: string | null
  phone?: string | null
  email?: string | null
  customer?: ClienteShopify | null
  shipping_address?: EnderecoShopify | null
  shipping_lines?: Array<{ price?: string | null }>
  line_items?: Array<{
    title?: string
    variant_title?: string | null
    variant_id?: number | string | null
    sku?: string | null
    quantity?: number
    price?: string
  }>
}

/** "Rua X, 123" → { logradouro: "Rua X", numero: "123" } */
function separarNumero(endereco?: string | null) {
  if (!endereco) return { logradouro: null, numero: null }
  const partes = endereco.split(',')
  if (partes.length < 2) return { logradouro: endereco.trim(), numero: 's/n' }
  return { logradouro: partes.slice(0, -1).join(',').trim(), numero: partes.at(-1)!.trim() || 's/n' }
}

function endereco(e?: EnderecoShopify | null) {
  if (!e?.address1) return null
  const { logradouro, numero } = separarNumero(e.address1)
  return {
    cep: e.zip ?? null,
    logradouro,
    numero,
    complemento: e.address2 ?? null,
    bairro: null,
    cidade: e.city ?? null,
    uf: /^[A-Za-z]{2}$/.test(e.province_code ?? '') ? e.province_code!.toUpperCase() : null,
  }
}

function statusPagamento(financial?: string | null) {
  if (financial === 'paid') return 'pago'
  if (financial === 'refunded' || financial === 'voided' || financial === 'partially_refunded') return 'estornado'
  return 'pendente'
}

export function clienteShopifyParaCrm(c: ClienteShopify | null | undefined, fallback?: { email?: string | null; phone?: string | null }) {
  const nome = [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim()
  const end = endereco(c?.default_address)
  return {
    shopify_customer_id: c?.id ? String(c.id) : null,
    nome: nome || null,
    email: c?.email ?? fallback?.email ?? null,
    whatsapp: c?.phone ?? c?.default_address?.phone ?? fallback?.phone ?? null,
    ...(end ?? {}),
  }
}

/** Converte o pedido da Shopify no formato aceito por importar_pedido_shopify(). */
export function pedidoShopifyParaCrm(p: PedidoShopify): Json {
  const entrega = (p.shipping_lines ?? []).reduce((soma, l) => soma + Number(l.price ?? 0), 0)
  return {
    shopify_order_id: String(p.id),
    criado_em: p.created_at ?? null,
    observacoes: [p.name ? `Shopify ${p.name}` : null, p.note].filter(Boolean).join(' · ') || null,
    status_pagamento: statusPagamento(p.financial_status),
    status: p.cancelled_at ? 'cancelado' : p.fulfillment_status === 'fulfilled' ? 'entregue' : null,
    taxa_entrega: entrega,
    desconto: Number(p.total_discounts ?? 0),
    endereco_entrega: endereco(p.shipping_address),
    cliente: clienteShopifyParaCrm(p.customer, { email: p.email, phone: p.phone ?? p.shipping_address?.phone }),
    itens: (p.line_items ?? []).map((i) => ({
      shopify_variant_id: i.variant_id ? String(i.variant_id) : null,
      sku: i.sku ?? null,
      descricao: [i.title, i.variant_title].filter(Boolean).join(' · '),
      quantidade: i.quantity ?? 1,
      preco_unitario: Number(i.price ?? 0),
    })),
  } as Json
}
