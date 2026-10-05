import { NextResponse, type NextRequest } from 'next/server'

import { reconciliarConversas } from '@/features/atendimento/sincronizacao'
import { uazapiConfigurada } from '@/features/atendimento/uazapi'
import { verificarChave } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

/**
 * Reconciliação do WhatsApp: a uazapi não reenvia webhooks que falharam, então
 * esta rotina confere as conversas com atividade nas últimas horas e traz as
 * mensagens que faltarem. Chamada pela Vercel Cron (vercel.ts) a cada 2 h.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado
  if (!uazapiConfigurada()) return NextResponse.json({ ok: false, motivo: 'UAZAPI_URL/UAZAPI_TOKEN não configurados.' })

  try {
    const resultado = await reconciliarConversas(createAdminClient(), { horas: 3 })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e) {
    console.error('[whatsapp] reconciliação falhou', e)
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : 'erro' }, { status: 502 })
  }
}
