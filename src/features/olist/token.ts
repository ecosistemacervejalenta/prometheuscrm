import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

import { ConexaoOlistExpirada, renovarTokens } from './oauth'

type Admin = ReturnType<typeof createAdminClient>

/** O Olist não está conectado (ou foi desconectado). */
export class OlistNaoConectado extends Error {}

const MARGEM_MS = 5 * 60_000
const TRAVA_MS = 60_000
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Token de acesso válido da Olist (renova quando faltam menos de 5 min).
 * O refresh token muda a cada renovação: se dois processos renovassem ao mesmo tempo, um
 * deles usaria um refresh já trocado e a conexão cairia. Por isso só quem pega a trava
 * (integracao_olist.renovando_token_desde) renova; os outros esperam o token novo.
 */
export async function obterTokenOlist(supabase: Admin): Promise<string> {
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    const { data: conexao, error } = await supabase
      .from('integracao_olist')
      .select('access_token, access_expira_em, refresh_token')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    if (!conexao?.refresh_token) throw new OlistNaoConectado('O Olist não está conectado.')

    const expiraEm = conexao.access_expira_em ? new Date(conexao.access_expira_em).getTime() : 0
    if (conexao.access_token && expiraEm > Date.now() + MARGEM_MS) return conexao.access_token

    const travaVencida = new Date(Date.now() - TRAVA_MS).toISOString()
    const { data: trava } = await supabase
      .from('integracao_olist')
      .update({ renovando_token_desde: new Date().toISOString() })
      .eq('id', 1)
      .not('refresh_token', 'is', null)
      .or(`renovando_token_desde.is.null,renovando_token_desde.lt."${travaVencida}"`)
      .select('refresh_token')
      .maybeSingle()

    if (trava?.refresh_token) {
      try {
        const tokens = await renovarTokens(trava.refresh_token)
        const { error: erroGravar } = await supabase
          .from('integracao_olist')
          .update({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_expira_em: tokens.accessExpiraEm,
            refresh_expira_em: tokens.refreshExpiraEm,
            renovando_token_desde: null,
          })
          .eq('id', 1)
        if (erroGravar) throw erroGravar
        return tokens.accessToken
      } catch (erro) {
        // Refresh vencido/revogado: marca a conexão como expirada (a tela pede para reconectar).
        await supabase
          .from('integracao_olist')
          .update(
            erro instanceof ConexaoOlistExpirada
              ? { renovando_token_desde: null, access_token: null, refresh_expira_em: new Date().toISOString() }
              : { renovando_token_desde: null },
          )
          .eq('id', 1)
        throw erro
      }
    }

    // Outro processo está renovando: espera o token novo.
    await esperar(1000)
  }
  throw new Error('A renovação do acesso à Olist demorou demais. Tente de novo em instantes.')
}
