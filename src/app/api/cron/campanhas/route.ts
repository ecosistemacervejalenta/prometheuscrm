import { NextResponse, type NextRequest } from 'next/server'

import type { PedidoRotina, RespostaRotina } from '@/features/campanhas/disparo'
import { analisarCampanha, enviarTeste, processarCampanhas, verificarConexao } from '@/features/campanhas/envio'
import { verificarChave } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

/**
 * Rotina das Campanhas do WhatsApp oficial (única que lê o token da Meta).
 *   GET  → uma rodada de envio. Chamada pela Vercel Cron (vercel.ts, a cada 5 min),
 *          ao confirmar uma campanha e quando o webhook avisa que a Meta aprovou.
 *   POST → pedidos da tela: { acao: 'verificar' | 'analisar' | 'teste', ... }.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado
  try {
    return NextResponse.json(await processarCampanhas(createAdminClient()))
  } catch (e) {
    console.error('[campanhas] rodada de envio falhou', e)
    return NextResponse.json({ ok: false, mensagem: e instanceof Error ? e.message : 'erro' }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const pedido = (await request.json().catch(() => null)) as PedidoRotina | null
  const supabase = createAdminClient()
  let resposta: RespostaRotina
  try {
    switch (pedido?.acao) {
      case 'verificar':
        resposta = await verificarConexao(supabase, pedido.pin ?? null)
        break
      case 'analisar':
        resposta = await analisarCampanha(supabase, pedido.campanhaId)
        break
      case 'teste':
        resposta = await enviarTeste(supabase, pedido.campanhaId, pedido.numero, pedido.nome)
        break
      default:
        return NextResponse.json({ ok: false, mensagem: 'Pedido inválido.' }, { status: 400 })
    }
  } catch (e) {
    console.error('[campanhas] pedido falhou', pedido?.acao, e)
    resposta = { ok: false, mensagem: 'Erro inesperado na rotina de envio. Tente de novo.' }
  }
  return NextResponse.json(resposta)
}
