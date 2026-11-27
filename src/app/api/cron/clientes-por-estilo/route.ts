import { NextResponse, type NextRequest } from 'next/server'

import { lerComprasDaLoja } from '@/features/estilos/sincronizacao'
import { verificarChave } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

/**
 * Clientes por estilo: lê na Shopify os pedidos atualizados desde a última rodada (com os itens e
 * o comprador), as collections e as collections dos produtos comprados.
 * Vercel Cron a cada 30 min (vercel.ts). Sem conexão ou sem permissão, só anota o motivo — a tela
 * Clientes › Por estilo mostra o que falta.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const resultado = await lerComprasDaLoja(createAdminClient())
  // "Falta conectar/permitir" não é falha da rotina: responde 200 para o cron não acusar erro à toa.
  const status = resultado.ok || resultado.motivo !== 'erro' ? 200 : 502
  return NextResponse.json(resultado, { status })
}
