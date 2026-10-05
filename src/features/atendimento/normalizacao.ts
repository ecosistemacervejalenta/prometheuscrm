import type { StatusMensagemWhatsapp } from '@/types'

import type { ChatUazapi, MensagemUazapi } from './uazapi'

/**
 * Converte o formato da uazapi no formato de registrar_mensagem_whatsapp.
 * Sem dependências de servidor: usado pelo webhook, pela sincronização e pelos testes.
 */

export type TipoMensagem =
  | 'texto'
  | 'imagem'
  | 'audio'
  | 'video'
  | 'documento'
  | 'figurinha'
  | 'localizacao'
  | 'contato'
  | 'reacao'
  | 'outro'

export type RegistroMensagem = {
  wa_id: string
  wa_messageid: string | null
  chatid: string
  whatsapp: string | null
  nome_whatsapp: string | null
  direcao: 'entrada' | 'saida'
  tipo: TipoMensagem
  texto: string | null
  midia_mime: string | null
  midia_nome: string | null
  midia_segundos: number | null
  citada_wa_id: string | null
  status: StatusMensagemWhatsapp | null
  enviada_em: string
  track_id: string | null
}

export type ResultadoRegistro = {
  mensagem_id: string
  contato_id?: string
  atendimento_id?: string | null
  contato_novo?: boolean
  atendimento_aberto?: boolean
  midia_pendente?: boolean
  duplicada: boolean
}

export const TIPOS_COM_MIDIA: TipoMensagem[] = ['imagem', 'audio', 'video', 'documento', 'figurinha']

const TIPOS: Record<string, TipoMensagem> = {
  Conversation: 'texto',
  ExtendedTextMessage: 'texto',
  ButtonsResponseMessage: 'texto',
  TemplateButtonReplyMessage: 'texto',
  ListResponseMessage: 'texto',
  InteractiveResponseMessage: 'texto',
  ButtonsMessage: 'texto',
  TemplateMessage: 'texto',
  ListMessage: 'texto',
  InteractiveMessage: 'texto',
  PollCreationMessage: 'texto',
  ImageMessage: 'imagem',
  ViewOnceMessage: 'imagem',
  AudioMessage: 'audio',
  VideoMessage: 'video',
  PtvMessage: 'video',
  DocumentMessage: 'documento',
  DocumentWithCaptionMessage: 'documento',
  StickerMessage: 'figurinha',
  LocationMessage: 'localizacao',
  LiveLocationMessage: 'localizacao',
  ContactMessage: 'contato',
  ContactsArrayMessage: 'contato',
  ReactionMessage: 'reacao',
}

const STATUS: Record<string, StatusMensagemWhatsapp> = {
  queued: 'enviando',
  pending: 'enviando',
  sent: 'enviada',
  serverack: 'enviada',
  delivered: 'entregue',
  deliveryack: 'entregue',
  read: 'lida',
  played: 'lida',
  failed: 'falhou',
  error: 'falhou',
}

/** "Delivered" → "entregue" (null se desconhecido). */
export function statusDaUazapi(status: string | null | undefined): StatusMensagemWhatsapp | null {
  return status ? (STATUS[status.toLowerCase()] ?? null) : null
}

/** Conversas fora do atendimento: grupos, canais, listas de transmissão e status. */
export function chatIgnorado(chatid: string) {
  return /@(g\.us|newsletter|broadcast)$/.test(chatid)
}

/** Número do contato: vem no JID "5511...@s.whatsapp.net"; em JIDs "@lid" só pelo snapshot do chat. */
export function numeroDoChat(chatid: string, chat?: ChatUazapi | null): string | null {
  if (chatid.endsWith('@s.whatsapp.net')) return chatid.split('@')[0].split(':')[0].replace(/\D/g, '') || null
  return chat?.phone?.replace(/\D/g, '') || null
}

function conteudo(m: MensagemUazapi): Record<string, unknown> {
  if (m.content && typeof m.content === 'object') return m.content as Record<string, unknown>
  if (typeof m.content === 'string' && m.content.startsWith('{')) {
    try {
      return JSON.parse(m.content) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

const textoDe = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Data da mensagem (a uazapi usa milissegundos; aceita segundos por segurança). */
function dataDaMensagem(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return new Date().toISOString()
  return new Date(ts < 1e12 ? ts * 1000 : ts).toISOString()
}

/**
 * Mensagem da uazapi → registro do CRM. Retorna null para o que não entra no
 * atendimento (grupos, mensagens de sistema, reação removida...).
 */
export function mensagemParaCrm(m: MensagemUazapi | null | undefined, chat?: ChatUazapi | null): RegistroMensagem | null {
  const chatid = m?.chatid?.trim()
  if (!m || !m.id || !chatid || m.isGroup || chatIgnorado(chatid)) return null
  // Conversa da loja com ela mesma ("Você" no WhatsApp) não é atendimento.
  if (m.owner && chatid.split('@')[0] === m.owner) return null

  const c = conteudo(m)
  const tipo = TIPOS[m.messageType ?? ''] ?? 'outro'
  // Menus e botões trazem o texto dentro do conteúdo.
  const resposta = c.Response as { SelectedDisplayText?: unknown } | undefined
  const modelo = c.hydratedTemplate as { hydratedContentText?: unknown } | undefined
  let texto =
    textoDe(m.text) ??
    textoDe(c.contentText) ??
    textoDe(c.selectedDisplayText) ??
    textoDe(resposta?.SelectedDisplayText) ??
    textoDe(modelo?.hydratedContentText)

  if (tipo === 'localizacao') {
    const lat = Number(c.degreesLatitude)
    const lng = Number(c.degreesLongitude)
    const nome = textoDe(c.name) ?? textoDe(c.address)
    texto = Number.isFinite(lat) && Number.isFinite(lng) ? [nome, `https://maps.google.com/?q=${lat},${lng}`].filter(Boolean).join('\n') : nome
  }
  if (tipo === 'contato') texto = texto ?? textoDe(c.displayName)
  if (tipo === 'reacao' && !texto) return null // reação removida
  if ((tipo === 'outro' || tipo === 'texto') && !texto) return null // sistema (apagada, editada, chave de grupo...)

  const direcao = m.fromMe ? 'saida' : 'entrada'
  const nomeContato = direcao === 'entrada' ? textoDe(chat?.wa_contactName) ?? textoDe(m.senderName) ?? textoDe(chat?.wa_name) : null

  return {
    wa_id: m.id,
    wa_messageid: m.messageid ?? null,
    chatid,
    whatsapp: numeroDoChat(chatid, chat),
    nome_whatsapp: nomeContato,
    direcao,
    tipo,
    texto: texto ? texto.slice(0, 8000) : null,
    midia_mime: TIPOS_COM_MIDIA.includes(tipo) ? textoDe(c.mimetype) : null,
    midia_nome: tipo === 'documento' ? (textoDe(c.fileName) ?? textoDe(c.title)) : null,
    midia_segundos: typeof c.seconds === 'number' ? Math.round(c.seconds) : null,
    citada_wa_id: textoDe(m.quoted),
    status: direcao === 'saida' ? statusDaUazapi(m.status) : null,
    enviada_em: dataDaMensagem(m.messageTimestamp),
    track_id: m.track_source === 'prometheus' ? (m.track_id ?? null) : null,
  }
}
