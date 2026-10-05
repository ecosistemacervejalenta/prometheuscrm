import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/types'

import { mensagemParaCrm, TIPOS_COM_MIDIA, type ResultadoRegistro } from './normalizacao'
import { chatsRecentes, mensagensDoChat, urlDaMidia } from './uazapi'

/**
 * Persistência do WhatsApp no CRM. Recebe o cliente Supabase de quem chama:
 * o admin no webhook/cron (sem usuário) e o do usuário nas Server Actions.
 */

type Db = SupabaseClient<Database>

export const BUCKET_MIDIAS = 'whatsapp'
/** Mesmo limite do bucket (25 MB). Acima disso, a mídia fica "indisponível" (abrir no celular). */
const LIMITE_MIDIA = 25 * 1024 * 1024

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
}

function extensao(mime: string, nome?: string | null) {
  const tipo = mime.split(';')[0].trim().toLowerCase()
  if (EXTENSOES[tipo]) return EXTENSOES[tipo]
  const doNome = nome?.match(/\.([a-z0-9]{1,8})$/i)?.[1]
  return doNome?.toLowerCase() ?? 'bin'
}

export async function registrarMensagem(db: Db, registro: NonNullable<ReturnType<typeof mensagemParaCrm>>) {
  const { data, error } = await db.rpc('registrar_mensagem_whatsapp', { p: registro as unknown as Json })
  if (error) throw error
  return data as unknown as ResultadoRegistro
}

/** Baixa a mídia da uazapi (URL expira em 2 dias) e guarda no bucket privado. */
export async function guardarMidia(db: Db, mensagemId: string) {
  const { data: msg } = await db
    .from('whatsapp_mensagens')
    .select('id, wa_id, contato_id, tipo, midia_nome, midia_status')
    .eq('id', mensagemId)
    .maybeSingle()
  if (!msg?.wa_id || !TIPOS_COM_MIDIA.includes(msg.tipo as never) || msg.midia_status === 'pronta') return false

  try {
    const { fileURL, mimetype } = await urlDaMidia(msg.wa_id, { mp3: msg.tipo === 'audio' })
    if (!fileURL) throw new Error('A uazapi não devolveu a URL da mídia.')

    const arquivo = await fetch(fileURL, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
    if (!arquivo.ok) throw new Error(`Download da mídia falhou (${arquivo.status}).`)
    if (Number(arquivo.headers.get('content-length') ?? 0) > LIMITE_MIDIA) throw new Error('Mídia maior que 25 MB.')
    const conteudo = await arquivo.arrayBuffer()
    if (conteudo.byteLength > LIMITE_MIDIA) throw new Error('Mídia maior que 25 MB.')

    const mime = (mimetype || arquivo.headers.get('content-type') || 'application/octet-stream').split(';')[0]
    const caminho = `${msg.contato_id}/${msg.id}.${extensao(mime, msg.midia_nome)}`
    const { error } = await db.storage.from(BUCKET_MIDIAS).upload(caminho, conteudo, { contentType: mime, upsert: true })
    if (error) throw error

    await db.from('whatsapp_mensagens').update({ midia_path: caminho, midia_mime: mime, midia_status: 'pronta' }).eq('id', msg.id)
    return true
  } catch (e) {
    console.error('[whatsapp] mídia não guardada', msg.id, e instanceof Error ? e.message : e)
    await db.from('whatsapp_mensagens').update({ midia_status: 'indisponivel' }).eq('id', msg.id)
    return false
  }
}

/**
 * Traz da uazapi as mensagens recentes de uma conversa que ainda não estão no CRM
 * (webhook perdido, histórico anterior à integração). Idempotente.
 */
export async function sincronizarConversa(db: Db, chatid: string, { limite = 50, baixarMidias = 0 } = {}) {
  const registros = (await mensagensDoChat(chatid, limite)).flatMap((m) => {
    const r = mensagemParaCrm(m)
    return r ? [r] : []
  })
  if (!registros.length) return 0

  const { data: existentes, error } = await db
    .from('whatsapp_mensagens')
    .select('wa_id')
    .in('wa_id', registros.map((r) => r.wa_id))
  if (error) throw error
  const jaTem = new Set(existentes.map((e) => e.wa_id))

  let novas = 0
  let midias = 0
  // A uazapi devolve da mais recente para a mais antiga: a primeira define o atendimento,
  // as anteriores entram como histórico.
  for (const registro of registros) {
    if (jaTem.has(registro.wa_id)) continue
    const r = await registrarMensagem(db, registro)
    if (r.duplicada) continue
    novas++
    if (r.midia_pendente && midias < baixarMidias) {
      midias++
      await guardarMidia(db, r.mensagem_id)
    }
  }
  return novas
}

/**
 * Reconciliação (cron): confere as conversas com atividade recente na uazapi e
 * sincroniza as que têm mensagem mais nova do que a última registrada no CRM.
 */
export async function reconciliarConversas(db: Db, { horas = 6, limite = 40 } = {}) {
  const desde = Date.now() - horas * 3_600_000
  const chats = (await chatsRecentes(limite)).filter((c) => c.wa_chatid && (c.wa_lastMsgTimestamp ?? 0) >= desde)

  let conversas = 0
  let mensagens = 0
  for (const chat of chats) {
    const chatid = chat.wa_chatid!
    const { data: contato } = await db.from('whatsapp_contatos').select('id').eq('chatid', chatid).maybeSingle()
    if (contato) {
      const { data: ultima } = await db
        .from('whatsapp_mensagens')
        .select('enviada_em')
        .eq('contato_id', contato.id)
        .order('enviada_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ultima && new Date(ultima.enviada_em).getTime() >= (chat.wa_lastMsgTimestamp ?? 0)) continue
    }
    const novas = await sincronizarConversa(db, chatid, { limite: 30, baixarMidias: 3 })
    if (novas > 0) {
      conversas++
      mensagens += novas
    }
  }
  return { conferidas: chats.length, conversas, mensagens }
}
