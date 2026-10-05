import 'server-only'

import { envServidor } from '@/lib/env.server'

/**
 * OAuth2 do Olist ERP (API v3, Keycloak em accounts.tiny.com.br).
 * Access token vale 4 h; o refresh token vale 1 dia e é renovado a cada uso.
 * Doc: https://api-docs.erp.olist.com/documentacao/comecando/autenticacao
 */

const BASE = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect'

/** Cookie com o `state` do OAuth (proteção contra CSRF entre /conectar e /callback). */
export const COOKIE_ESTADO_OAUTH = 'olist_oauth_state'

export type TokensOlist = {
  accessToken: string
  refreshToken: string
  accessExpiraEm: string
  refreshExpiraEm: string
}

/** Erro de autorização definitivo (refresh vencido/revogado): exige reconectar. */
export class ConexaoOlistExpirada extends Error {}

/** Variáveis do aplicativo Olist que ainda não chegaram ao servidor (faltam na Vercel ou falta redeploy). */
export function variaveisOlistFaltando(): string[] {
  return [
    !envServidor.olistClientId && 'OLIST_CLIENT_ID',
    !envServidor.olistClientSecret && 'OLIST_CLIENT_SECRET',
  ].filter((v): v is string => Boolean(v))
}

export function olistConfigurado(): boolean {
  return variaveisOlistFaltando().length === 0
}

function credenciais() {
  const { olistClientId, olistClientSecret } = envServidor
  if (!olistClientId || !olistClientSecret) {
    throw new Error('Configure OLIST_CLIENT_ID e OLIST_CLIENT_SECRET nas variáveis de ambiente.')
  }
  return { client_id: olistClientId, client_secret: olistClientSecret }
}

export function urlDeAutorizacao(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: credenciais().client_id,
    redirect_uri: redirectUri,
    scope: 'openid',
    response_type: 'code',
    state,
  })
  return `${BASE}/auth?${params}`
}

async function pedirToken(corpo: Record<string, string>): Promise<TokensOlist> {
  const resposta = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...credenciais(), ...corpo }),
    cache: 'no-store',
  })
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
  if (!resposta.ok || typeof dados.access_token !== 'string' || typeof dados.refresh_token !== 'string') {
    const motivo = String(dados.error_description ?? dados.error ?? `HTTP ${resposta.status}`)
    // invalid_grant = refresh/código vencido ou revogado: não adianta tentar de novo.
    if (dados.error === 'invalid_grant') throw new ConexaoOlistExpirada(`Conexão com o Olist expirou (${motivo}).`)
    throw new Error(`Falha na autenticação do Olist: ${motivo}`)
  }
  const agora = Date.now()
  const expiraEm = (segundos: unknown, padrao: number) =>
    new Date(agora + (Number(segundos) > 0 ? Number(segundos) : padrao) * 1000).toISOString()
  return {
    accessToken: dados.access_token,
    refreshToken: dados.refresh_token,
    accessExpiraEm: expiraEm(dados.expires_in, 4 * 3600),
    refreshExpiraEm: expiraEm(dados.refresh_expires_in, 24 * 3600),
  }
}

export function trocarCodigoPorTokens(codigo: string, redirectUri: string) {
  return pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: redirectUri })
}

export function renovarTokens(refreshToken: string) {
  return pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken })
}
