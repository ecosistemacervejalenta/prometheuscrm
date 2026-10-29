import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Notificações do Mercado Livre (URL de retorno de notificações do app, tópico Orders).
 * Por enquanto só registra que chegaram — a tela mostra o passo como concluído. O
 * Mercado Livre exige resposta 200 rápida; avisos de outro app são ignorados.
 */
export async function POST(request: NextRequest) {
  const aviso = (await request.json().catch(() => null)) as { application_id?: number | string } | null
  const supabase = createAdminClient()
  const { data } = await supabase.from('integracao_marketplace').select('client_id').eq('canal', 'mercado_livre').maybeSingle()
  if (aviso?.application_id && data?.client_id && String(aviso.application_id) === data.client_id) {
    await supabase
      .from('integracao_marketplace')
      .update({ notificacao_recebida_em: new Date().toISOString() })
      .eq('canal', 'mercado_livre')
  }
  return NextResponse.json({ ok: true })
}
