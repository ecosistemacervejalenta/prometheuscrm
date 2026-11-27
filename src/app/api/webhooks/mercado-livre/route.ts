import { after, NextResponse, type NextRequest } from 'next/server'

import { processarNotificacaoMercadoLivre, type NotificacaoMercadoLivre } from '@/features/marketplaces/alertas-mercado-livre'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Notificações do Mercado Livre (URL de retorno de notificações do app).
 * O Mercado Livre exige HTTP 200 em até 500 ms — senão repete e pode desligar os tópicos —,
 * então a resposta sai na hora e o trabalho (buscar a pergunta/mensagem/reclamação e avisar o
 * grupo da equipe) roda depois, com after(). Avisos de outro app são ignorados lá dentro.
 */
export async function POST(request: NextRequest) {
  const aviso = (await request.json().catch(() => null)) as NotificacaoMercadoLivre | null
  after(async () => {
    try {
      await processarNotificacaoMercadoLivre(createAdminClient(), aviso)
    } catch (erro) {
      console.error('[mercado-livre] notificação não processada', aviso?.topic, aviso?.resource, erro)
    }
  })
  return NextResponse.json({ ok: true })
}
