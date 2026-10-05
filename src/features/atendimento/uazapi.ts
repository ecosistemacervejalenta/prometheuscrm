import 'server-only'

import { envServidor } from '@/lib/env.server'

/**
 * Cliente da uazapi (WhatsApp Web da loja) — só o que o Atendimento usa.
 * Doc: https://docs.uazapi.com · autenticação pelo header "token" (token da instância).
 * Limite da instância: 10 chamadas/s. Envios NÃO são repetidos automaticamente
 * (um timeout pode ter enviado a mensagem mesmo assim).
 */

export class ErroUazapi extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem)
  }
}

/** Mensagem como a uazapi devolve (webhook "messages", /send/text e /message/find). */
export type MensagemUazapi = {
  id?: string
  messageid?: string
  chatid?: string
  sender?: string
  senderName?: string
  fromMe?: boolean
  wasSentByApi?: boolean
  isGroup?: boolean
  messageType?: string
  text?: string
  messageTimestamp?: number
  content?: unknown
  status?: string
  quoted?: string
  track_source?: string
  track_id?: string
  owner?: string
  error?: string
}

/** Snapshot do chat que acompanha o webhook (campos usados). */
export type ChatUazapi = {
  wa_chatid?: string
  phone?: string
  name?: string
  wa_name?: string
  wa_contactName?: string
  wa_isGroup?: boolean
  wa_lastMsgTimestamp?: number
}

export type StatusInstancia = {
  instance?: { status?: string; profileName?: string; owner?: string; isBusiness?: boolean }
  status?: { connected?: boolean; loggedIn?: boolean }
}

export type ConfigWebhook = {
  id?: string
  enabled?: boolean
  url?: string
  events?: string[]
  excludeMessages?: string[]
}

export type ErroWebhookUazapi = { created?: string; event?: string; status_code?: number; error?: string }

export const EVENTOS_WEBHOOK = ['messages', 'messages_update', 'connection']
/** Grupos (ex.: Grupo VIP) ficam fora do atendimento. */
export const FILTROS_WEBHOOK = ['isGroupYes']

export function uazapiConfigurada() {
  return Boolean(envServidor.uazapiUrl && envServidor.uazapiToken)
}

function mensagemDeErro(status: number, corpo: unknown): string {
  const detalhe =
    corpo && typeof corpo === 'object'
      ? String((corpo as { error?: unknown; message?: unknown }).error ?? (corpo as { message?: unknown }).message ?? '')
      : String(corpo ?? '')
  if (status === 401) return 'O token do WhatsApp foi recusado. Confira UAZAPI_TOKEN na Vercel.'
  if (status === 429) return 'Muitas mensagens em sequência. Aguarde um instante e tente de novo.'
  if (/disconnected|not connected|not logged/i.test(detalhe)) {
    return 'O WhatsApp da loja está desconectado. Reconecte o número no painel da uazapi.'
  }
  return detalhe ? `WhatsApp: ${detalhe}` : `O servidor do WhatsApp respondeu com erro (${status}).`
}

async function chamar<T>(
  caminho: string,
  { metodo = 'POST', corpo, timeoutMs = 15_000 }: { metodo?: 'GET' | 'POST'; corpo?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const base = envServidor.uazapiUrl
  const token = envServidor.uazapiToken
  if (!base || !token) throw new ErroUazapi('WhatsApp não configurado: cadastre UAZAPI_URL e UAZAPI_TOKEN na Vercel.')

  let resposta: Response
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { token, Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError'
    throw new ErroUazapi(timeout ? 'O WhatsApp demorou para responder.' : 'Não foi possível falar com o servidor do WhatsApp.')
  }

  const texto = await resposta.text()
  let dados: unknown = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  if (!resposta.ok) throw new ErroUazapi(mensagemDeErro(resposta.status, dados), resposta.status)
  return dados as T
}

export function statusInstancia() {
  return chamar<StatusInstancia>('/instance/status', { metodo: 'GET', timeoutMs: 8_000 })
}

/** Envia texto. trackId = id da mensagem no CRM (volta no webhook e evita duplicar). */
export function enviarTexto(chatid: string, texto: string, trackId: string) {
  return chamar<MensagemUazapi>('/send/text', {
    corpo: { number: chatid, text: texto, track_source: 'prometheus', track_id: trackId, readchat: true },
    timeoutMs: 25_000,
  })
}

/** image · video (MP4) · document · audio (arquivo) · ptt (mensagem de voz, convertida pela uazapi). */
export type TipoMidiaUazapi = 'image' | 'video' | 'document' | 'audio' | 'ptt'

/** Envia uma mídia pelo link (assinado) do arquivo. Legenda não vale para áudio. */
export function enviarMidia(
  chatid: string,
  midia: { tipo: TipoMidiaUazapi; url: string; legenda?: string | null; nomeArquivo?: string | null; mime?: string | null },
  trackId: string,
) {
  const documento = midia.tipo === 'document'
  return chamar<MensagemUazapi>('/send/media', {
    corpo: {
      number: chatid,
      type: midia.tipo,
      file: midia.url,
      ...(midia.legenda && midia.tipo !== 'audio' && midia.tipo !== 'ptt' ? { text: midia.legenda } : {}),
      ...(documento && midia.nomeArquivo ? { docName: midia.nomeArquivo } : {}),
      ...(documento && midia.mime ? { mimetype: midia.mime } : {}),
      track_source: 'prometheus',
      track_id: trackId,
      readchat: true,
    },
    timeoutMs: 60_000,
  })
}

/** URL pública (válida por 2 dias) de uma mídia recebida. Áudio volta em MP3 (toca em qualquer navegador). */
export function urlDaMidia(waId: string, { mp3 = false } = {}) {
  return chamar<{ fileURL?: string; mimetype?: string }>('/message/download', {
    corpo: { id: waId, generate_mp3: mp3 },
    timeoutMs: 30_000,
  })
}

/** Mensagens mais recentes de uma conversa (a uazapi guarda até 7 dias). */
export async function mensagensDoChat(chatid: string, limite = 50) {
  const r = await chamar<{ messages?: MensagemUazapi[] }>('/message/find', { corpo: { chatid, limit: limite, offset: 0 } })
  return r?.messages ?? []
}

/** Conversas 1:1 com atividade mais recente primeiro (reconciliação). */
export async function chatsRecentes(limite = 50) {
  const r = await chamar<{ chats?: ChatUazapi[] }>('/chat/find', {
    corpo: { sort: '-wa_lastMsgTimestamp', limit: limite, offset: 0, wa_isGroup: false, compact: true },
  })
  return r?.chats ?? []
}

/** Marca a conversa como lida no WhatsApp (os "risquinhos azuis" para o cliente). */
export function marcarChatLido(chatid: string) {
  return chamar<unknown>('/chat/read', { corpo: { number: chatid, read: true }, timeoutMs: 8_000 })
}

export async function webhooksConfigurados() {
  const r = await chamar<ConfigWebhook[] | ConfigWebhook | null>('/webhook', { metodo: 'GET', timeoutMs: 8_000 })
  if (!r) return []
  return Array.isArray(r) ? r : [r]
}

/** Configura o webhook principal da instância apontando para o CRM. */
export function configurarWebhook(url: string) {
  return chamar<unknown>('/webhook', {
    corpo: {
      enabled: true,
      url,
      events: EVENTOS_WEBHOOK,
      excludeMessages: FILTROS_WEBHOOK,
      addUrlEvents: false,
      addUrlTypesMessages: false,
    },
  })
}

export async function errosDoWebhook() {
  const r = await chamar<ErroWebhookUazapi[] | null>('/webhook/errors', { metodo: 'GET', timeoutMs: 8_000 })
  return Array.isArray(r) ? r : []
}
