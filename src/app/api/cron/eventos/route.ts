import { NextResponse, type NextRequest } from 'next/server'

import { verificarChave } from '@/features/integracoes/api-auth'
import { processarFilaDeEventos } from '@/features/integracoes/eventos'
import { envServidor } from '@/lib/env.server'

/**
 * Processa a fila de eventos (webhooks de saída).
 * Chamado pela Vercel Cron (vercel.ts) — que envia "Authorization: Bearer CRON_SECRET" —
 * ou por um agendamento no n8n com o mesmo header.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const resultado = await processarFilaDeEventos(200)
  return NextResponse.json({ ok: true, ...resultado })
}
