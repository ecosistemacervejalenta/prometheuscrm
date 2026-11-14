import { after, NextResponse, type NextRequest } from 'next/server'

import { segredosIguais } from '@/features/integracoes/api-auth'
import { chaveWebhookEstoqueOlist, processarFilaEstoqueOlist, receberAvisoEstoqueOlist } from '@/features/olist/estoque'

export const maxDuration = 120

/**
 * Aviso de estoque da Olist ("Lançamentos de estoque" em Configurações › Webhooks na Olist).
 * A Olist não assina o aviso: a URL leva uma chave secreta (?chave=...). Responde 200 na hora
 * (senão a Olist reenvia) e lê o saldo novo dos produtos citados logo depois.
 */
export async function POST(request: NextRequest) {
  const esperada = chaveWebhookEstoqueOlist()
  const chave = request.nextUrl.searchParams.get('chave') ?? ''
  if (!esperada || !segredosIguais(chave, esperada)) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })

  const texto = await request.text().catch(() => '')
  let corpo: unknown = null
  try {
    corpo = JSON.parse(texto)
  } catch {
    // Alguns avisos chegam como formulário (dados=JSON).
    const dados = new URLSearchParams(texto).get('dados')
    try {
      corpo = dados ? JSON.parse(dados) : null
    } catch {
      corpo = null
    }
  }

  after(async () => {
    try {
      await receberAvisoEstoqueOlist(corpo)
      await processarFilaEstoqueOlist({ tempoMaximoMs: 60_000 })
    } catch (erro) {
      console.error('[olist-webhook] aviso de estoque', erro instanceof Error ? erro.message : erro)
    }
  })
  return NextResponse.json({ ok: true })
}

/** A Olist (e quem testar no navegador) pode conferir se a URL responde. */
export async function GET(request: NextRequest) {
  const esperada = chaveWebhookEstoqueOlist()
  const chave = request.nextUrl.searchParams.get('chave') ?? ''
  if (!esperada || !segredosIguais(chave, esperada)) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  return NextResponse.json({ ok: true, servico: 'estoque da Olist no Prometheus CRM' })
}
