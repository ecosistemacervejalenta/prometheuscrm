import { NextResponse, type NextRequest } from 'next/server'

import { verificarChave } from '@/features/integracoes/api-auth'
import { sincronizarOlist } from '@/features/olist/sincronizacao'
import { envServidor } from '@/lib/env.server'

export const maxDuration = 300

/**
 * Sincroniza os pedidos do Olist ERP (e renova o token de acesso).
 * Chamado pela Vercel Cron (vercel.ts, várias vezes ao dia), pelo botão
 * "Atualizar" e pela Visão geral quando os dados ficam desatualizados.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const resultado = await sincronizarOlist()
  const status = resultado.ok || resultado.codigo !== 'erro' ? 200 : 502
  return NextResponse.json(resultado, { status })
}
