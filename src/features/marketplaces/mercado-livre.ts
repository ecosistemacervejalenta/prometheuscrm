import 'server-only'

/**
 * OAuth2 e chamadas da API do Mercado Livre (Brasil).
 * Access token vale 6 h; o refresh token é de uso único e volta renovado a cada troca.
 * Doc: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
 */

const AUTORIZACAO = 'https://auth.mercadolivre.com.br/authorization'
const API = 'https://api.mercadolibre.com'

export type TokensMercadoLivre = {
  accessToken: string
  refreshToken: string
  accessExpiraEm: string
  contaId: string
}

/** Autorização revogada ou vencida (invalid_grant): só reconectando. */
export class AutorizacaoExpirada extends Error {}

/** Link da tela de autorização. Usa PKCE (S256) além do `state`. */
export function urlDeAutorizacao(clientId: string, redirectUri: string, estado: string, desafioPkce: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: estado,
    code_challenge: desafioPkce,
    code_challenge_method: 'S256',
  })
  return `${AUTORIZACAO}?${params}`
}

async function pedirToken(corpo: Record<string, string>): Promise<TokensMercadoLivre> {
  const resposta = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo),
    cache: 'no-store',
  })
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
  if (!resposta.ok || typeof dados.access_token !== 'string' || typeof dados.refresh_token !== 'string') {
    const motivo = String(dados.message ?? dados.error_description ?? dados.error ?? `HTTP ${resposta.status}`)
    if (dados.error === 'invalid_grant') throw new AutorizacaoExpirada(`O Mercado Livre recusou a autorização (${motivo}).`)
    if (dados.error === 'invalid_client') throw new Error('O Mercado Livre não reconheceu o Client ID ou a Secret Key — confira os dados salvos.')
    throw new Error(`Falha na autenticação do Mercado Livre: ${motivo}`)
  }
  const segundos = Number(dados.expires_in) > 0 ? Number(dados.expires_in) : 6 * 3600
  return {
    accessToken: dados.access_token,
    refreshToken: dados.refresh_token,
    accessExpiraEm: new Date(Date.now() + segundos * 1000).toISOString(),
    contaId: String(dados.user_id ?? ''),
  }
}

export function trocarCodigo(clientId: string, segredo: string, codigo: string, redirectUri: string, verificadorPkce: string) {
  return pedirToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: segredo,
    code: codigo,
    redirect_uri: redirectUri,
    code_verifier: verificadorPkce,
  })
}

export function renovarTokens(clientId: string, segredo: string, refreshToken: string) {
  return pedirToken({ grant_type: 'refresh_token', client_id: clientId, client_secret: segredo, refresh_token: refreshToken })
}

/** Conta autorizada (id e apelido de vendedor). */
export async function buscarConta(accessToken: string): Promise<{ id: string; nome: string }> {
  const resposta = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
  if (!resposta.ok) throw new Error(`O Mercado Livre não devolveu a conta (${String(dados.message ?? `HTTP ${resposta.status}`)}).`)
  return { id: String(dados.id ?? ''), nome: String(dados.nickname ?? '') }
}
