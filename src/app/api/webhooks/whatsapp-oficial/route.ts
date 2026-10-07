import { createHmac } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { acordarEnvios } from '@/features/campanhas/disparo'
import { lerCredenciais } from '@/features/campanhas/envio'
import { tratarAvisoMeta, type AvisoMeta } from '@/features/campanhas/webhook'
import { segredosIguais } from '@/features/integracoes/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlDoSite } from '@/lib/url'

/**
 * Webhook do WhatsApp oficial (Meta) — Configurações › WhatsApp oficial › passo 7.
 *   GET  → verificação da Meta (hub.verify_token = token de verificação do CRM).
 *   POST → avisos assinados com a chave secreta do app (X-Hub-Signature-256).
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const credenciais = await lerCredenciais(createAdminClient())
  const token = p.get('hub.verify_token') ?? ''
  if (p.get('hub.mode') === 'subscribe' && credenciais?.token_verificacao && segredosIguais(token, credenciais.token_verificacao)) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('Token de verificação inválido.', { status: 403 })
}

export async function POST(request: NextRequest) {
  const bruto = await request.text()
  const supabase = createAdminClient()
  const credenciais = await lerCredenciais(supabase)
  if (!credenciais?.app_secret) return NextResponse.json({ erro: 'WhatsApp oficial não conectado.' }, { status: 503 })

  const assinatura = request.headers.get('x-hub-signature-256') ?? ''
  const esperada = `sha256=${createHmac('sha256', credenciais.app_secret).update(bruto).digest('hex')}`
  if (!segredosIguais(assinatura, esperada)) {
    console.error('[whatsapp-oficial] assinatura do webhook não confere — confira a chave secreta do app')
    return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 })
  }

  let aviso: AvisoMeta
  try {
    aviso = JSON.parse(bruto) as AvisoMeta
  } catch {
    return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 })
  }
  if (aviso.object !== 'whatsapp_business_account') return NextResponse.json({ ok: true, ignorado: true })

  try {
    // Modelo aprovado: a rotina de envio começa logo, sem esperar o próximo cron.
    const conta = { phoneNumberId: credenciais.phone_number_id, wabaId: credenciais.waba_id }
    if (await tratarAvisoMeta(supabase, aviso, conta)) acordarEnvios(await urlDoSite())
  } catch (e) {
    // 500 faz a Meta reenviar o aviso depois (tudo aqui é idempotente).
    console.error('[whatsapp-oficial] falha ao tratar aviso', e)
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
