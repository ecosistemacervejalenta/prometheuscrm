import { NextResponse, type NextRequest } from 'next/server'

import { assinaturaValida } from '@/features/mercado-pago/api'
import { credenciais, sincronizarPagamento } from '@/features/mercado-pago/cobranca'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

/**
 * Avisos do Mercado Pago (Webhooks, tópico Pagamentos — também chega pela notification_url
 * de cada PIX). O aviso só diz QUAL pagamento mudou: a situação é sempre conferida na API
 * com o nosso Access Token, então um aviso falso não dá baixa em nada.
 * Formatos aceitos: ?data.id=123&type=payment (Webhooks) e ?id=123&topic=payment (IPN antigo).
 */
export async function POST(request: NextRequest) {
  const url = request.nextUrl
  const corpo = (await request.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null
  const tipo = corpo?.type ?? corpo?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const id = String(url.searchParams.get('data.id') ?? corpo?.data?.id ?? url.searchParams.get('id') ?? '').trim()

  // Só pagamentos interessam; o resto (merchant_order, testes de outros tópicos) recebe 200 e fim.
  if (tipo !== 'payment' || !/^\d+$/.test(id)) return NextResponse.json({ ok: true, ignorado: true })

  const db = createAdminClient()
  const acesso = await credenciais(db)
  if (!acesso) return NextResponse.json({ ok: true, ignorado: 'sem conexão' })

  // Assinatura secreta salva + cabeçalho presente → precisa bater.
  const assinatura = request.headers.get('x-signature')
  if (acesso.segredoWebhook && assinatura) {
    const valida = assinaturaValida(acesso.segredoWebhook, {
      assinatura,
      requestId: request.headers.get('x-request-id'),
      dataId: url.searchParams.get('data.id') ?? id,
    })
    if (!valida) {
      console.warn('[mercado-pago] webhook com assinatura inválida', id)
      return NextResponse.json({ ok: false, erro: 'Assinatura inválida.' }, { status: 401 })
    }
  }

  await db.from('integracao_mercado_pago').update({ notificacao_recebida_em: new Date().toISOString() }).eq('id', 1)

  try {
    const resultado = await sincronizarPagamento(db, id)
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    // 500 → o Mercado Pago tenta de novo (a cada 15 min); a rotina também confere os pendentes.
    console.error('[mercado-pago] webhook', id, e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

/** O painel do Mercado Pago às vezes abre a URL: responde que está no ar. */
export function GET() {
  return NextResponse.json({ ok: true, servico: 'webhook do Mercado Pago' })
}
