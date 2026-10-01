import { NextResponse, type NextRequest } from 'next/server'

import { erroJson, verificarChave } from '@/features/integracoes/api-auth'
import { agendarProcessamentoDeEventos } from '@/features/integracoes/eventos'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

/** POST /api/v1/pedidos/{id}/cobranca — registra cobrança enviada por automação (n8n). */
export async function POST(request: NextRequest, contexto: RouteContext<'/api/v1/pedidos/[id]/cobranca'>) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  const { id } = await contexto.params
  const { data, error } = await createAdminClient().rpc('registrar_cobranca', { p_pedido_id: id })
  if (error) return erroJson(error.message, error.code === 'P0001' ? 404 : 400)

  agendarProcessamentoDeEventos()
  return NextResponse.json({ dados: data })
}
