import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'

import type { NomeVariavelMeta, StatusMeta } from './meta'

/** Quais variáveis da Meta estão na Vercel (sem chamar a Meta). */
export function statusMeta(): StatusMeta {
  const variaveis: Record<NomeVariavelMeta, boolean> = {
    META_WHATSAPP_TOKEN: Boolean(envServidor.metaWhatsappToken),
    META_WHATSAPP_PHONE_NUMBER_ID: Boolean(envServidor.metaPhoneNumberId),
    META_WHATSAPP_WABA_ID: Boolean(envServidor.metaWabaId),
    META_APP_SECRET: Boolean(envServidor.metaAppSecret),
    META_WEBHOOK_VERIFY_TOKEN: Boolean(envServidor.metaWebhookVerifyToken),
  }
  return { variaveis, configurado: Object.values(variaveis).every(Boolean) }
}

export type ListaParaCampanha = { id: string; nome: string; pasta: string; comWhatsapp: number }

/** Listas do Banco de Leads prontas e com WhatsApp, para escolher o público. */
export async function listasParaCampanha(): Promise<ListaParaCampanha[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('leads_listas')
    .select('id, nome, com_whatsapp, leads_pastas(nome)')
    .eq('status', 'pronta')
    .gt('com_whatsapp', 0)
    .order('nome')
  if (error) throw error
  return data
    .map((l) => ({ id: l.id, nome: l.nome, pasta: l.leads_pastas?.nome ?? 'Sem pasta', comWhatsapp: l.com_whatsapp }))
    .sort((a, b) => a.pasta.localeCompare(b.pasta, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
}
