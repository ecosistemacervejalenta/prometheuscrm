import { NextResponse, type NextRequest } from 'next/server'

import { verificarChave } from '@/features/integracoes/api-auth'
import { sincronizarOlist, type ModoSincronizacao } from '@/features/olist/sincronizacao'
import { envServidor } from '@/lib/env.server'

export const maxDuration = 300

/**
 * Sincroniza os pedidos do Olist ERP (e renova o token de acesso).
 * Chamado pela Vercel Cron (vercel.ts: a cada 4 h e uma reconciliação completa
 * de madrugada), pelo botão "Atualizar" e pela Visão geral (?modo=rapida).
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const modo = request.nextUrl.searchParams.get('modo')
  const resultado = await sincronizarOlist(modo === 'rapida' || modo === 'completa' ? (modo as ModoSincronizacao) : 'padrao')
  const status = resultado.ok || resultado.codigo !== 'erro' ? 200 : 502
  return NextResponse.json(resultado, { status })
}
