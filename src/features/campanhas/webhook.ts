import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { whatsappCanonico } from '@/lib/whatsapp'

import { aplicarStatusModelo, conferir, pausarPorErro } from './envio'
import { classeDoErro, ERRO_SAIU_DO_MARKETING, mensagemDoErro } from './erros-meta'
import { TEXTO_BOTAO_SAIR } from './mensagem'
import { faixaDoLimite } from './meta'
import { PAYLOAD_SAIR } from './modelo-meta'
import { pedidoParaSair } from './status'

/**
 * Avisos da Meta no webhook do número das Campanhas:
 *   messages                      → status (enviada, entregue, lida, falhou) e respostas dos contatos
 *   message_template_status_update → modelo aprovado, recusado ou pausado
 *   phone_number_quality_update / business_capability_update → novo limite diário
 *   user_preferences              → contato parou (ou voltou a aceitar) marketing pelo próprio WhatsApp
 * Tudo é idempotente: a Meta pode repetir o mesmo aviso. Erros do banco sobem como
 * exceção (a rota responde 500 e a Meta reenvia depois).
 */

type Admin = ReturnType<typeof createAdminClient>

type Valor = Record<string, unknown>
type Mudanca = { field?: string; value?: Valor }
export type AvisoMeta = { object?: string; entry?: Array<{ id?: string; changes?: Mudanca[] }> }

/** Número e conta conectados: avisos de outros números do mesmo app são ignorados. */
export type ContaConectada = { phoneNumberId: string | null; wabaId: string | null }

type StatusMeta = {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>
}

type MensagemRecebida = {
  from?: string
  timestamp?: string
  type?: string
  context?: { id?: string }
  text?: { body?: string }
  button?: { payload?: string; text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
}

const quando = (timestamp: string | undefined) =>
  timestamp && /^\d+$/.test(timestamp) ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString()

const ROTULO_TIPO: Record<string, string> = {
  image: '[foto]',
  audio: '[áudio]',
  video: '[vídeo]',
  document: '[documento]',
  sticker: '[figurinha]',
  location: '[localização]',
  contacts: '[contato]',
  reaction: '[reação]',
}

function textoDaMensagem(m: MensagemRecebida): string {
  if (m.type === 'text') return m.text?.body ?? ''
  if (m.type === 'button') return m.button?.text ?? ''
  if (m.type === 'interactive') return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ''
  return ROTULO_TIPO[m.type ?? ''] ?? '[mensagem]'
}

async function descadastrar(supabase: Admin, numero: string | undefined) {
  const whatsapp = whatsappCanonico(numero)
  if (whatsapp) {
    conferir(await supabase.from('whatsapp_descadastros').upsert({ whatsapp, origem: 'meta' }, { onConflict: 'whatsapp', ignoreDuplicates: true }))
  }
}

/**
 * Falha da conta avisada depois do envio (ex.: foto inacessível, pagamento): o envio volta
 * para a fila e a campanha pausa — senão a lista inteira seria gasta com o mesmo erro.
 */
async function pausarPelaFalha(supabase: Admin, wamid: string, mensagem: string) {
  const { data: envio } = conferir(await supabase.from('campanha_envios').select('id, campanha_id').eq('wamid', wamid).maybeSingle())
  if (!envio) return
  conferir(await supabase.from('campanha_envios').update({ status: 'pendente', wamid: null, enviada_em: null }).eq('id', envio.id))
  await pausarPorErro(supabase, envio.campanha_id, mensagem)
}

async function tratarMensagens(supabase: Admin, valor: Valor) {
  for (const s of (valor.statuses as StatusMeta[] | undefined) ?? []) {
    if (!s.id || !s.status) continue
    const erro = s.errors?.[0]
    const codigo = erro?.code ?? null
    const mensagem = mensagemDoErro(codigo, erro?.error_data?.details ?? erro?.message ?? erro?.title)
    conferir(
      await supabase.rpc('atualizar_status_envio_campanha', {
        p_wamid: s.id,
        p_status: s.status,
        p_quando: quando(s.timestamp),
        p_erro_codigo: s.status === 'failed' ? (codigo ?? undefined) : undefined,
        p_erro: s.status === 'failed' ? mensagem : undefined,
      }),
    )
    if (s.status !== 'failed') continue
    if (codigo === ERRO_SAIU_DO_MARKETING) await descadastrar(supabase, s.recipient_id)
    else if (classeDoErro(codigo) === 'conta') await pausarPelaFalha(supabase, s.id, mensagem)
  }

  for (const m of (valor.messages as MensagemRecebida[] | undefined) ?? []) {
    if (!m.from) continue
    const texto = textoDaMensagem(m)
    const saiu =
      (m.type === 'button' && (m.button?.payload === PAYLOAD_SAIR || m.button?.text === TEXTO_BOTAO_SAIR)) || pedidoParaSair(texto)
    conferir(
      await supabase.rpc('registrar_resposta_campanha', {
        p_wa_id: m.from,
        p_texto: texto,
        p_quando: quando(m.timestamp),
        p_saiu: saiu,
        p_contexto: m.context?.id,
      }),
    )
  }
}

async function atualizarLimite(supabase: Admin, valor: Valor) {
  const faixa = faixaDoLimite(valor.max_daily_conversations_per_business ?? valor.current_limit)
  if (faixa) conferir(await supabase.from('whatsapp_oficial').update({ limite_tier: faixa }).eq('id', 1))
}

/** Trata um POST do webhook. Devolve true se alguma campanha ficou pronta para enviar agora. */
export async function tratarAvisoMeta(supabase: Admin, aviso: AvisoMeta, conta: ContaConectada): Promise<boolean> {
  let liberouEnvio = false
  for (const entrada of aviso.entry ?? []) {
    // O id da entrada é a conta do WhatsApp (WABA): avisos de outra conta do mesmo app ficam de fora.
    if (conta.wabaId && entrada.id && entrada.id !== conta.wabaId) continue
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value ?? {}
      switch (mudanca.field) {
        case 'messages': {
          const numero = (valor.metadata as { phone_number_id?: string } | undefined)?.phone_number_id
          if (!conta.phoneNumberId || numero === conta.phoneNumberId) await tratarMensagens(supabase, valor)
          break
        }
        case 'message_template_status_update': {
          const id = valor.message_template_id
          const evento = typeof valor.event === 'string' ? valor.event : null
          if ((typeof id === 'number' || typeof id === 'string') && evento) {
            const motivo = typeof valor.reason === 'string' ? valor.reason : null
            const categoria = typeof valor.message_template_category === 'string' ? valor.message_template_category : null
            if (await aplicarStatusModelo(supabase, String(id), evento, categoria, motivo)) liberouEnvio = true
          }
          break
        }
        case 'phone_number_quality_update':
        case 'business_capability_update':
          await atualizarLimite(supabase, valor)
          break
        case 'user_preferences':
          for (const p of (valor.user_preferences as Array<{ wa_id?: string; category?: string; value?: string }> | undefined) ?? []) {
            if (p.category !== 'marketing_messages') continue
            if (p.value === 'stop') await descadastrar(supabase, p.wa_id)
            if (p.value === 'resume') {
              const whatsapp = whatsappCanonico(p.wa_id)
              if (whatsapp) conferir(await supabase.from('whatsapp_descadastros').delete().eq('whatsapp', whatsapp).eq('origem', 'meta'))
            }
          }
          break
      }
    }
  }
  conferir(await supabase.from('whatsapp_oficial').update({ webhook_recebido_em: new Date().toISOString() }).eq('id', 1))
  return liberouEnvio
}
