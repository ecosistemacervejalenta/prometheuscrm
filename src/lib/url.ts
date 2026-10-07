import 'server-only'

import { headers } from 'next/headers'

import { envPublico } from './env'

/**
 * URL base do CRM, usada para montar os links públicos de pré-venda.
 * Prioridade: NEXT_PUBLIC_SITE_URL → domínio de produção da Vercel → host da requisição.
 */
export async function urlDoSite(): Promise<string> {
  if (envPublico.siteUrl) return envPublico.siteUrl
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  return urlDaRequisicao()
}

/**
 * Endereço por onde a requisição atual chegou (o domínio que a equipe ou a Meta usou).
 * Para chamadas do CRM para ele mesmo e para a URL do webhook: funciona mesmo com um
 * domínio próprio cadastrado na Vercel e ainda sem DNS.
 */
export async function urlDaRequisicao(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocolo}://${host}`
}

export async function linkPreVenda(slug: string): Promise<string> {
  return `${await urlDoSite()}/p/${slug}`
}
