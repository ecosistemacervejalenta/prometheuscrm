import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'

import { olistConfigurado } from './oauth'

export type StatusOlist = {
  /** OLIST_CLIENT_ID/SECRET definidos. */
  configurado: boolean
  /** CRON_SECRET definido (necessário para sincronizar). */
  sincronizacaoDisponivel: boolean
  conectado: boolean
  expirada: boolean
  conectadoEm: string | null
  ultimaSincronizacao: string | null
  ultimoErro: string | null
}

/** Status da conexão com o Olist (sem tokens), lido com a sessão do usuário. */
export async function statusOlist(): Promise<StatusOlist> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('status_integracao_olist')
  if (error) throw error
  const s = (data ?? {}) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    configurado: olistConfigurado(),
    sincronizacaoDisponivel: Boolean(envServidor.cronSecret),
    conectado: s.conectado === true,
    expirada: s.expirada === true,
    conectadoEm: texto(s.conectado_em),
    ultimaSincronizacao: texto(s.ultima_sincronizacao),
    ultimoErro: texto(s.ultimo_erro),
  }
}
