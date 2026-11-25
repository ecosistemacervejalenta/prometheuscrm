import 'server-only'

import { entradaDaCotacao, escolherFrete, type PedidoParaCotar, type ResultadoDaCotacao, type TaxaDaShopify } from './cotacao'

/**
 * Chamadas à Admin API da Shopify para calcular o frete.
 *   • Token: o app da loja (Dev Dashboard) troca Client ID + Client secret por um token de 24 h
 *     (client credentials grant) — não há token fixo para colar.
 *     Docs: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
 *   • Frete: draftOrderCalculate devolve as taxas de entrega (inclusive as do Olist Envios) para
 *     um endereço e um peso SEM criar rascunho nem pedido na loja. Precisa de write_draft_orders.
 *     Docs: https://shopify.dev/docs/api/admin-graphql/latest/mutations/draftOrderCalculate
 */

const VERSAO_API = '2026-10'
export const ESCOPO_NECESSARIO = 'write_draft_orders'

/** A Shopify espera o app de entregas responder; o cliente está olhando a tela. */
const ESPERA_COTACAO_MS = 12_000
const ESPERA_TOKEN_MS = 10_000

export type TipoErroShopify = 'credenciais' | 'permissao' | 'recusou' | 'fora_do_ar'

export class ErroShopify extends Error {
  constructor(
    mensagem: string,
    readonly tipo: TipoErroShopify,
  ) {
    super(mensagem)
  }
}

export type AcessoShopify = { loja: string; token: string }
export type TokenShopify = { token: string; expiraEm: string; escopos: string }

const base = (loja: string) => `https://${loja}.myshopify.com`

function erroDeRede(e: unknown): ErroShopify {
  if (e instanceof ErroShopify) return e
  const demorou = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
  return new ErroShopify(demorou ? 'A Shopify demorou demais para responder.' : 'Não foi possível falar com a Shopify.', 'fora_do_ar')
}

/** Troca Client ID + Client secret por um token (vale 24 h). */
export async function pedirToken(loja: string, clientId: string, clientSecret: string): Promise<TokenShopify> {
  let resposta: Response
  try {
    resposta = await fetch(`${base(loja)}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(ESPERA_TOKEN_MS),
    })
  } catch (e) {
    throw erroDeRede(e)
  }

  const texto = await resposta.text().catch(() => '')
  let corpo: { access_token?: string; scope?: string; expires_in?: number; error?: string; error_description?: string } | null = null
  try {
    corpo = JSON.parse(texto)
  } catch {
    corpo = null
  }

  if (resposta.ok && corpo?.access_token) {
    const segundos = Number(corpo.expires_in) > 0 ? Number(corpo.expires_in) : 86_399
    return { token: corpo.access_token, expiraEm: new Date(Date.now() + segundos * 1000).toISOString(), escopos: corpo.scope ?? '' }
  }

  const motivo = `${corpo?.error ?? ''} ${corpo?.error_description ?? ''} ${corpo ? '' : texto.slice(0, 300)}`.toLowerCase()
  if (resposta.status === 404 || (resposta.status >= 300 && resposta.status < 400)) {
    throw new ErroShopify(`Não achei a loja "${loja}.myshopify.com". Confira o endereço da loja.`, 'credenciais')
  }
  if (motivo.includes('shop_not_permitted')) {
    throw new ErroShopify(
      'A Shopify não deixou este app acessar a loja: o app precisa ser criado a partir do admin desta mesma loja (Configurações › Apps › Desenvolver apps) e estar instalado nela.',
      'credenciais',
    )
  }
  if (resposta.status === 429 || resposta.status >= 500) {
    throw new ErroShopify(`A Shopify está fora do ar ou ocupada (HTTP ${resposta.status}). Tente de novo em instantes.`, 'fora_do_ar')
  }
  if (motivo.includes('invalid_client') || motivo.includes('application_cannot_be_found') || resposta.status === 401 || resposta.status === 400) {
    throw new ErroShopify('A Shopify recusou o Client ID ou o Client secret. Copie os dois de novo em Configurações do app, no Dev Dashboard, e confira se o app está instalado na loja.', 'credenciais')
  }
  throw new ErroShopify(`A Shopify recusou o acesso (HTTP ${resposta.status}).`, 'credenciais')
}

/** `errors` vem como lista (GraphQL) ou como texto solto (recusas da API, ex.: token inválido). */
type RespostaGraphql<T> = { data?: T | null; errors?: Array<{ message?: string; extensions?: { code?: string } }> | string }

async function graphql<T>(acesso: AcessoShopify, query: string, variables: Record<string, unknown>, esperaMs: number): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`${base(acesso.loja)}/admin/api/${VERSAO_API}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': acesso.token },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(esperaMs),
    })
  } catch (e) {
    throw erroDeRede(e)
  }

  if (resposta.status === 401) throw new ErroShopify('A Shopify não aceitou o token de acesso.', 'credenciais')
  if (resposta.status === 403) throw new ErroShopify(`O app não tem a permissão de rascunhos de pedido (${ESCOPO_NECESSARIO}) nesta loja.`, 'permissao')
  if (resposta.status === 402 || resposta.status === 423) throw new ErroShopify('A loja da Shopify está pausada ou bloqueada.', 'recusou')
  if (resposta.status === 429 || resposta.status >= 500) throw new ErroShopify(`A Shopify está fora do ar ou ocupada (HTTP ${resposta.status}).`, 'fora_do_ar')

  const corpo = (await resposta.json().catch(() => null)) as RespostaGraphql<T> | null
  if (!resposta.ok || !corpo) throw new ErroShopify(`A Shopify respondeu algo inesperado (HTTP ${resposta.status}).`, 'recusou')

  if (typeof corpo.errors === 'string') throw new ErroShopify(`A Shopify recusou a consulta: ${corpo.errors}`.slice(0, 300), 'recusou')
  const erro = corpo.errors?.[0]
  if (erro) {
    const codigo = erro.extensions?.code ?? ''
    if (codigo === 'ACCESS_DENIED') throw new ErroShopify(`O app não tem a permissão de rascunhos de pedido (${ESCOPO_NECESSARIO}) nesta loja.`, 'permissao')
    if (codigo === 'THROTTLED') throw new ErroShopify('A Shopify pediu para esperar (muitas consultas seguidas).', 'fora_do_ar')
    throw new ErroShopify(`A Shopify recusou a consulta: ${erro.message || codigo || 'erro'}`.slice(0, 300), 'recusou')
  }
  if (!corpo.data) throw new ErroShopify('A Shopify não devolveu dados.', 'recusou')
  return corpo.data
}

/** Nome e endereço .myshopify.com da loja (confere que o token funciona). */
export async function consultarLoja(acesso: AcessoShopify): Promise<{ nome: string; dominio: string }> {
  const dados = await graphql<{ shop: { name: string; myshopifyDomain: string } }>(acesso, '{ shop { name myshopifyDomain } }', {}, ESPERA_TOKEN_MS)
  return { nome: dados.shop.name, dominio: dados.shop.myshopifyDomain }
}

const CALCULAR = `mutation CalcularFrete($input: DraftOrderInput!) {
  draftOrderCalculate(input: $input) {
    calculatedDraftOrder { availableShippingRates { handle title price { amount currencyCode } } }
    userErrors { field message }
  }
}`

type RespostaCalculo = {
  draftOrderCalculate: {
    calculatedDraftOrder: { availableShippingRates: TaxaDaShopify[] } | null
    userErrors: Array<{ field?: string[] | null; message: string }>
  } | null
}

/**
 * Opções de entrega da loja para a caixa (só cálculo: nada é criado na Shopify) e a escolhida
 * (a mais barata do Olist Envios). Erros de conexão/permissão sobem como ErroShopify.
 */
export async function calcularFrete(acesso: AcessoShopify, pedido: PedidoParaCotar): Promise<ResultadoDaCotacao> {
  const input = entradaDaCotacao(pedido)
  if (!input) return { ok: false, motivo: 'endereco_incompleto', detalhe: 'o endereço de entrega está sem CEP, cidade ou UF' }

  const dados = await graphql<RespostaCalculo>(acesso, CALCULAR, { input }, ESPERA_COTACAO_MS)
  const calculo = dados.draftOrderCalculate
  const recusa = calculo?.userErrors?.[0]
  if (recusa) return { ok: false, motivo: 'shopify_recusou', detalhe: `a Shopify não aceitou o endereço ou os itens: ${recusa.message}`.slice(0, 300) }
  return escolherFrete(calculo?.calculatedDraftOrder?.availableShippingRates ?? [], input.lineItems[0].quantity)
}
