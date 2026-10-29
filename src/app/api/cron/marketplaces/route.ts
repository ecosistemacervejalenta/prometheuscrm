import { NextResponse, type NextRequest } from 'next/server'

import { verificarChave } from '@/features/integracoes/api-auth'
import {
  concluirConexao,
  manterConexoes,
  verificarConexao,
  type PedidoRotinaMarketplace,
  type RespostaRotinaMarketplace,
} from '@/features/marketplaces/rotina'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

/**
 * Rotina das conexões com Mercado Livre e Shopee (única que lê a chave secreta dos apps).
 *   GET  → renova o acesso e confere as contas. Chamada 1x/dia pela Vercel Cron (vercel.ts).
 *   POST → pedidos da tela e do retorno da autorização: { acao: 'conectar' | 'verificar', ... }.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado
  try {
    return NextResponse.json({ ok: true, canais: await manterConexoes(createAdminClient()) })
  } catch (e) {
    console.error('[marketplaces] rodada diária falhou', e)
    return NextResponse.json({ ok: false, mensagem: e instanceof Error ? e.message : 'erro' }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const pedido = (await request.json().catch(() => null)) as PedidoRotinaMarketplace | null
  const supabase = createAdminClient()
  let resposta: RespostaRotinaMarketplace
  try {
    switch (pedido?.acao) {
      case 'conectar':
        resposta = await concluirConexao(supabase, pedido)
        break
      case 'verificar':
        resposta = await verificarConexao(supabase, pedido.canal)
        break
      default:
        return NextResponse.json({ ok: false, mensagem: 'Pedido inválido.' }, { status: 400 })
    }
  } catch (e) {
    console.error('[marketplaces] pedido falhou', pedido?.acao, e)
    resposta = { ok: false, mensagem: 'Erro inesperado na rotina dos marketplaces. Tente de novo.' }
  }
  return NextResponse.json(resposta)
}
