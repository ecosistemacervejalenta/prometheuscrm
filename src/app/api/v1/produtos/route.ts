import { NextResponse, type NextRequest } from 'next/server'

import { erroJson, verificarChave } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/v1/produtos?ativos=true — catálogo de cervejas. */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  let consulta = createAdminClient().from('produtos').select('*').order('nome')
  if (request.nextUrl.searchParams.get('ativos') !== 'false') consulta = consulta.eq('ativo', true)

  const { data, error } = await consulta
  if (error) return erroJson(error.message, 500)
  return NextResponse.json({ dados: data })
}
