/**
 * Marketplaces conectados direto ao CRM (além do Olist), para trazer as taxas de
 * cada venda e o valor que realmente sobra. `slug` é o trecho usado nas rotas
 * /api/marketplaces/<slug>/conectar e /callback.
 */

export type IdMarketplace = 'mercado_livre' | 'shopee'

export const MARKETPLACES: Record<IdMarketplace, { nome: string; slug: string }> = {
  mercado_livre: { nome: 'Mercado Livre', slug: 'mercado-livre' },
  shopee: { nome: 'Shopee', slug: 'shopee' },
}

export function marketplaceDoSlug(slug: string): IdMarketplace | null {
  const achado = (Object.keys(MARKETPLACES) as IdMarketplace[]).find((id) => MARKETPLACES[id].slug === slug)
  return achado ?? null
}

/** Cookie com o `state` (anti-CSRF) e o verificador PKCE, entre /conectar e /callback. */
export const cookieAutorizacao = (slug: string) => `mkt_oauth_${slug.replace('-', '_')}`

/** Caminho de retorno da autorização (cadastrado no app do marketplace). */
export const caminhoCallback = (id: IdMarketplace) => `/api/marketplaces/${MARKETPLACES[id].slug}/callback`

/** Status da conexão como a tela vê (função status_marketplaces): sem tokens nem chaves. */
export type StatusMarketplace = {
  configurado: boolean
  client_id: string | null
  conectado: boolean
  conta_id: string | null
  conta_nome: string | null
  conectado_em: string | null
  autorizacao_expira_em: string | null
  verificado_em: string | null
  notificacao_recebida_em: string | null
  ultimo_erro: string | null
}

export const SEM_CONEXAO: StatusMarketplace = {
  configurado: false,
  client_id: null,
  conectado: false,
  conta_id: null,
  conta_nome: null,
  conectado_em: null,
  autorizacao_expira_em: null,
  verificado_em: null,
  notificacao_recebida_em: null,
  ultimo_erro: null,
}

/** Mensagens do retorno da autorização (?marketplace=<slug>&status=...). */
export const AVISOS_MARKETPLACE: Record<string, { tom: 'sucesso' | 'erro' | 'alerta'; texto: (nome: string) => string }> = {
  conectado: { tom: 'sucesso', texto: (nome) => `${nome} conectado! A conta autorizada aparece no quadro abaixo.` },
  cancelado: { tom: 'alerta', texto: (nome) => `A autorização foi cancelada na tela do ${nome}.` },
  'erro-estado': {
    tom: 'erro',
    texto: (nome) => `Não foi possível validar o retorno do ${nome} (a sessão expirou). Clique em Conectar de novo.`,
  },
  'erro-token': {
    tom: 'erro',
    texto: (nome) => `O ${nome} recusou a conexão. Veja o motivo no quadro abaixo e confira o passo a passo.`,
  },
  'apenas-admin': { tom: 'alerta', texto: (nome) => `Apenas administradores conectam o ${nome}.` },
  'sem-credenciais': { tom: 'alerta', texto: (nome) => `Salve o ID e a chave do app do ${nome} antes de conectar.` },
}
