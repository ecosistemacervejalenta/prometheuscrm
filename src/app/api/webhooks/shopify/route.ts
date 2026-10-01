import { NextResponse, type NextRequest } from 'next/server'

import { erroJson } from '@/features/integracoes/api-auth'
import { agendarProcessamentoDeEventos } from '@/features/integracoes/eventos'
import { assinaturaShopifyValida, clienteShopifyParaCrm, pedidoShopifyParaCrm } from '@/features/integracoes/shopify'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Recebe webhooks da Shopify (JSON) e sincroniza pedidos e clientes.
 * Configure em Shopify Admin › Configurações › Notificações › Webhooks.
 */
export async function POST(request: NextRequest) {
  const segredo = envServidor.shopifyWebhookSecret
  if (!segredo) return erroJson('SHOPIFY_WEBHOOK_SECRET não configurado.', 503)

  const corpo = await request.text()
  if (!assinaturaShopifyValida(corpo, request.headers.get('x-shopify-hmac-sha256'), segredo)) {
    return erroJson('Assinatura inválida.', 401)
  }

  const topico = request.headers.get('x-shopify-topic') ?? ''
  const dados = JSON.parse(corpo)
  const db = createAdminClient()

  if (topico.startsWith('orders/')) {
    const { data, error } = await db.rpc('importar_pedido_shopify', { p_pedido: pedidoShopifyParaCrm(dados) })
    if (error) {
      console.error('[shopify] falha ao importar pedido', error)
      return erroJson('Falha ao importar o pedido.', 500)
    }
    agendarProcessamentoDeEventos()
    return NextResponse.json({ ok: true, pedido_id: data })
  }

  if (topico.startsWith('customers/')) {
    const cliente = clienteShopifyParaCrm(dados)
    if (!cliente.shopify_customer_id) return erroJson('Cliente sem ID.', 422)

    const { data: existente } = await db
      .from('clientes')
      .select('id')
      .eq('shopify_customer_id', cliente.shopify_customer_id)
      .maybeSingle()

    const campos = {
      nome: cliente.nome ?? 'Cliente Shopify',
      email: cliente.email,
      ...(cliente.whatsapp ? { whatsapp: cliente.whatsapp } : {}),
      shopify_customer_id: cliente.shopify_customer_id,
    }
    const { error } = existente
      ? await db.from('clientes').update(campos).eq('id', existente.id)
      : await db.from('clientes').insert({ ...campos, origem: 'shopify' })

    if (error && error.code !== '23505') {
      console.error('[shopify] falha ao sincronizar cliente', error)
      return erroJson('Falha ao sincronizar o cliente.', 500)
    }
    agendarProcessamentoDeEventos()
    return NextResponse.json({ ok: true })
  }

  // Tópico não tratado: responde 200 para a Shopify não reenviar.
  return NextResponse.json({ ok: true, ignorado: topico })
}
