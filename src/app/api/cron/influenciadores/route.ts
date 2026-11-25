import { NextResponse, type NextRequest } from 'next/server'

import { sincronizarVendas } from '@/features/influenciadores/sincronizacao'
import { verificarChave } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

/**
 * Programa de influenciadores: lê na Shopify os pedidos atualizados desde a última rodada e
 * registra as vendas feitas com cupom (novas, pagas, canceladas, estornadas).
 * Vercel Cron a cada 15 min (vercel.ts). Sem conexão ou sem a permissão de pedidos, só anota o
 * motivo — a tela Influenciadores › Ajustes mostra o que falta.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const resultado = await sincronizarVendas(createAdminClient())
  // "Falta conectar/permitir" não é falha da rotina: responde 200 para o cron não acusar erro à toa.
  const status = resultado.ok || resultado.motivo !== 'erro' ? 200 : 502
  return NextResponse.json(resultado, { status })
}
