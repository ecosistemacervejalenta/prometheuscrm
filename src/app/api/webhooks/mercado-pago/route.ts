import { NextResponse, type NextRequest } from 'next/server'

import { assinaturaValida, ErroMercadoPago } from '@/features/mercado-pago/api'
import { credenciais, sincronizarOrder } from '@/features/mercado-pago/cobranca'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

/**
 * Avisos do Mercado Pago (Webhooks › evento "Order (Mercado Pago)").
 * Formato: ?data.id=ORD...&type=order, corpo { type: 'order', action, data: { id, status... } }.
 * O aviso só diz QUAL order mudou: a situação é sempre conferida em GET /v1/orders/{id}
 * com o nosso Access Token, então um aviso falso não dá baixa em nada.
 */
export async function POST(request: NextRequest) {
  const url = request.nextUrl
  const corpo = (await request.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null
  const tipo = corpo?.type ?? corpo?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const id = String(url.searchParams.get('data.id') ?? corpo?.data?.id ?? url.searchParams.get('id') ?? '').trim()

  // Só orders interessam; outros tópicos (e o "Testar" de outros eventos) recebem 200 e fim.
  if (tipo !== 'order' || !/^[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ ok: true, ignorado: true })

  const db = createAdminClient()
  const acesso = await credenciais(db)
  if (!acesso) return NextResponse.json({ ok: true, ignorado: 'sem conexão' })

  // Assinatura: só diagnóstico. A baixa nunca depende do aviso (a order é conferida na API
  // com o nosso token), então um aviso sem assinatura válida não tem como marcar nada como pago.
  const assinatura = request.headers.get('x-signature')
  if (acesso.segredoWebhook && assinatura) {
    const requestId = request.headers.get('x-request-id')
    const dataId = url.searchParams.get('data.id') ?? id
    if (!assinaturaValida(acesso.segredoWebhook, { assinatura, requestId, dataId })) {
      console.warn('[mercado-pago] assinatura do webhook não confere', {
        id,
        dataIdNaUrl: url.searchParams.has('data.id'),
        temRequestId: Boolean(requestId),
        ts: assinatura.match(/ts=([^,]+)/)?.[1] ?? null,
        tamanhoChave: acesso.segredoWebhook.length,
      })
    }
  }

  await db.from('integracao_mercado_pago').update({ notificacao_recebida_em: new Date().toISOString() }).eq('id', 1)

  try {
    const resultado = await sincronizarOrder(db, id)
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    // Order de teste do painel ("Testar") não existe na conta: responde 200 para o teste passar.
    if (e instanceof ErroMercadoPago && e.status === 404) return NextResponse.json({ ok: true, ignorado: 'order inexistente' })
    const mensagem = e instanceof Error ? e.message : String(e)
    // 500 → o Mercado Pago tenta de novo; a rotina também confere os pendentes.
    console.error('[mercado-pago] webhook', id, mensagem)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

/** O painel do Mercado Pago às vezes abre a URL: responde que está no ar. */
export function GET() {
  return NextResponse.json({ ok: true, servico: 'webhook do Mercado Pago' })
}
