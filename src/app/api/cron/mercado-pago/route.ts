import { NextResponse, type NextRequest } from 'next/server'

import { verificarChave } from '@/features/integracoes/api-auth'
import { reconciliarPendentes, verificarConexao } from '@/features/mercado-pago/cobranca'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

/**
 * Rotina do Mercado Pago (única, com o webhook e o link, que lê o Access Token).
 *   GET  → confere os PIX pendentes dos últimos 3 dias (rede de segurança se um aviso se perder).
 *   POST → pedido da tela de configurações: { acao: 'verificar' }.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado
  try {
    return NextResponse.json({ ok: true, ...(await reconciliarPendentes(createAdminClient())) })
  } catch (e) {
    console.error('[mercado-pago] rotina falhou', e)
    return NextResponse.json({ ok: false, mensagem: e instanceof Error ? e.message : 'erro' }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado
  const pedido = (await request.json().catch(() => null)) as { acao?: string } | null
  if (pedido?.acao !== 'verificar') return NextResponse.json({ ok: false, mensagem: 'Pedido inválido.' }, { status: 400 })
  return NextResponse.json(await verificarConexao(createAdminClient()))
}
