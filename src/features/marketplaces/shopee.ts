import 'server-only'

import { createHmac } from 'node:crypto'

/**
 * OAuth e chamadas da Shopee Open Platform (API v2), loja brasileira.
 * Access token vale 4 h; o refresh token vale 30 dias, é de uso único e volta renovado.
 * A loja autoriza o app por até 365 dias. As chamadas são assinadas com HMAC-SHA256
 * da Partner Key. O servidor do CRM fica em São Paulo (vercel.ts → gru1), então usa o
 * domínio da API indicado para as Américas.
 * Doc: https://open.shopee.com/developer-guide/20 e /developer-guide/16
 */

const AUTORIZACAO = 'https://open.shopee.com.br/auth'
const API = 'https://openplatform.shopee.com.br'

export type TokensShopee = {
  accessToken: string
  refreshToken: string
  accessExpiraEm: string
  refreshExpiraEm: string
}

/** Autorização vencida, revogada ou refresh inválido: só autorizando de novo. */
export class AutorizacaoExpirada extends Error {}

function assinar(partnerKey: string, ...partes: Array<string | number>): string {
  return createHmac('sha256', partnerKey).update(partes.join('')).digest('hex')
}

/** Link da tela de autorização da loja (formato novo, sem assinatura). */
export function urlDeAutorizacao(partnerId: string, redirectUri: string, estado: string): string {
  const params = new URLSearchParams({
    partner_id: partnerId,
    auth_type: 'seller',
    redirect_uri: redirectUri,
    response_type: 'code',
    state: estado,
  })
  return `${AUTORIZACAO}?${params}`
}

type RespostaShopee = Record<string, unknown> & { error?: string; message?: string }

function erroDaShopee(caminho: string, dados: RespostaShopee, status: number): Error {
  const codigo = dados.error || `HTTP ${status}`
  const motivo = dados.message ? `${codigo}: ${dados.message}` : codigo
  if (/invalid_ac+es+_token|invalid_refresh_token|error_auth|invalid_code/i.test(codigo)) {
    return new AutorizacaoExpirada(`A Shopee recusou a autorização (${motivo}). Autorize a loja de novo.`)
  }
  if (/error_sign|invalid_partner|error_partner/i.test(codigo)) {
    return new Error(`A Shopee não reconheceu o Partner ID ou a Partner Key (${motivo}). Confira se são os de produção (Live).`)
  }
  return new Error(`A Shopee respondeu com erro em ${caminho} (${motivo}).`)
}

async function chamarAuth(partnerId: string, partnerKey: string, caminho: string, corpo: Record<string, unknown>): Promise<TokensShopee> {
  const timestamp = Math.floor(Date.now() / 1000)
  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    sign: assinar(partnerKey, partnerId, caminho, timestamp),
  })
  const resposta = await fetch(`${API}${caminho}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corpo, partner_id: Number(partnerId) }),
    cache: 'no-store',
  })
  const dados = (await resposta.json().catch(() => ({}))) as RespostaShopee
  if (!resposta.ok || dados.error || typeof dados.access_token !== 'string' || typeof dados.refresh_token !== 'string') {
    throw erroDaShopee(caminho, dados, resposta.status)
  }
  const segundos = Number(dados.expire_in) > 0 ? Number(dados.expire_in) : 4 * 3600
  return {
    accessToken: dados.access_token,
    refreshToken: dados.refresh_token,
    accessExpiraEm: new Date(Date.now() + segundos * 1000).toISOString(),
    refreshExpiraEm: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  }
}

export function trocarCodigo(partnerId: string, partnerKey: string, codigo: string, shopId: string) {
  return chamarAuth(partnerId, partnerKey, '/api/v2/auth/token/get', { code: codigo, shop_id: Number(shopId) })
}

export function renovarTokens(partnerId: string, partnerKey: string, refreshToken: string, shopId: string) {
  return chamarAuth(partnerId, partnerKey, '/api/v2/auth/access_token/get', { refresh_token: refreshToken, shop_id: Number(shopId) })
}

/** Chamada GET de loja (assinatura: partner_id, caminho, timestamp, access_token, shop_id). */
async function chamarLoja(
  partnerId: string,
  partnerKey: string,
  accessToken: string,
  shopId: string,
  caminho: string,
): Promise<RespostaShopee> {
  const timestamp = Math.floor(Date.now() / 1000)
  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: shopId,
    sign: assinar(partnerKey, partnerId, caminho, timestamp, accessToken, shopId),
  })
  const resposta = await fetch(`${API}${caminho}?${params}`, { cache: 'no-store' })
  const dados = (await resposta.json().catch(() => ({}))) as RespostaShopee
  if (!resposta.ok || dados.error) throw erroDaShopee(caminho, dados, resposta.status)
  return dados
}

/** Nome da loja e até quando vale a autorização dada ao app. */
export async function buscarLoja(partnerId: string, partnerKey: string, accessToken: string, shopId: string) {
  const dados = await chamarLoja(partnerId, partnerKey, accessToken, shopId, '/api/v2/shop/get_shop_info')
  const expira = Number(dados.expire_time)
  return {
    nome: String(dados.shop_name ?? ''),
    autorizacaoExpiraEm: expira > 0 ? new Date(expira * 1000).toISOString() : null,
  }
}
