import { NextResponse, type NextRequest } from 'next/server'

import { erroJson, verificarChave } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlDoSite } from '@/lib/url'

/** GET /api/v1/pre-vendas?status=ativa — pré-vendas com o link público pronto para disparo. */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  const status = request.nextUrl.searchParams.get('status')
  let consulta = createAdminClient().from('vw_pre_vendas').select('*').order('criado_em', { ascending: false }).limit(100)
  if (status === 'ativa' || status === 'encerrada' || status === 'rascunho') consulta = consulta.eq('status_efetivo', status)

  const { data, error } = await consulta
  if (error) return erroJson(error.message, 500)

  const site = await urlDoSite()
  return NextResponse.json({ dados: (data ?? []).map((pv) => ({ ...pv, link: `${site}/p/${pv.slug}` })) })
}
