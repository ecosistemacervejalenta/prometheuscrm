import { after, NextResponse, type NextRequest } from 'next/server'

import { mensagemParaCrm, statusDaUazapi } from '@/features/atendimento/normalizacao'
import { guardarMidia, registrarMensagem, sincronizarConversa } from '@/features/atendimento/sincronizacao'
import type { ChatUazapi, MensagemUazapi } from '@/features/atendimento/uazapi'
import { erroJson, segredosIguais } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

type EventoUazapi = {
  EventType?: string
  token?: string
  message?: MensagemUazapi
  chat?: ChatUazapi
  state?: string
  type?: string
  event?: { MessageIDs?: string[] | null; Type?: string; IsGroup?: boolean; IsFromMe?: boolean }
}

/**
 * Recebe os eventos do WhatsApp da loja (uazapi). Configurado pelo botão
 * "Ativar webhook" em Configurações › Integrações (eventos messages,
 * messages_update e connection; grupos excluídos).
 * A uazapi não assina o corpo: o evento traz o token da instância, que precisa
 * ser igual ao UAZAPI_TOKEN. A resposta é rápida — mídias são baixadas depois.
 */
export async function POST(request: NextRequest) {
  const token = envServidor.uazapiToken
  if (!token) return erroJson('UAZAPI_TOKEN não configurado.', 503)

  const corpo = await request.text()
  if (corpo.length > 2_000_000) return erroJson('Evento grande demais.', 413)
  let evento: EventoUazapi
  try {
    evento = JSON.parse(corpo)
  } catch {
    return erroJson('JSON inválido.', 400)
  }
  if (typeof evento.token !== 'string' || !segredosIguais(evento.token, token)) return erroJson('Não autorizado.', 401)

  const db = createAdminClient()

  if (evento.EventType === 'messages') {
    const registro = mensagemParaCrm(evento.message, evento.chat)
    if (!registro) return NextResponse.json({ ok: true, ignorado: true })

    try {
      const r = await registrarMensagem(db, registro)
      if (!r.duplicada && r.midia_pendente) after(() => guardarMidia(db, r.mensagem_id))
      // Primeiro contato: traz o que a uazapi ainda guarda (até 7 dias) para dar contexto à equipe.
      if (r.contato_novo) {
        after(() =>
          sincronizarConversa(db, registro.chatid, { limite: 50 }).catch((e) =>
            console.error('[whatsapp] histórico não importado', e instanceof Error ? e.message : e),
          ),
        )
      }
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.error('[whatsapp] falha ao registrar mensagem', e)
      return erroJson('Falha ao registrar a mensagem.', 500)
    }
  }

  if (evento.EventType === 'messages_update') {
    const ids = evento.event?.MessageIDs?.filter(Boolean) ?? []
    const status = statusDaUazapi(evento.state ?? evento.event?.Type)
    if (!ids.length || !status || evento.event?.IsGroup || evento.event?.IsFromMe === false) {
      return NextResponse.json({ ok: true, ignorado: true })
    }
    const { error } = await db.rpc('atualizar_status_whatsapp', { p_messageids: ids, p_status: status })
    if (error) {
      console.error('[whatsapp] falha ao atualizar status', error)
      return erroJson('Falha ao atualizar o status.', 500)
    }
    return NextResponse.json({ ok: true })
  }

  // connection e demais eventos: o status da conexão é lido na hora em Configurações.
  return NextResponse.json({ ok: true, ignorado: evento.EventType ?? null })
}
