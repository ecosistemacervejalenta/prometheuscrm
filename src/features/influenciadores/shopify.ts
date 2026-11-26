import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { ErroShopify, graphql, type AcessoShopify } from '@/features/shopify/api'
import { acessoShopify } from '@/features/shopify/frete'
import type { Database } from '@/types/database.types'

/**
 * Programa de influenciadores × Admin API da Shopify (mesmo app do cálculo de frete).
 *   • Cupons nativos: criar, achar pelo código, ligar/desligar e trocar o percentual.
 *     Escopo: write_discounts. Docs: https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountCodeBasicCreate
 *   • Pedidos: lê só valores, situação e cupons usados (nenhum dado do cliente).
 *     Escopo: read_orders (enxerga os últimos 60 dias). Docs: https://shopify.dev/docs/api/admin-graphql/latest/queries/orders
 */

type Banco = SupabaseClient<Database>

export const ESCOPO_CUPONS = 'write_discounts'
export const ESCOPO_PEDIDOS = 'read_orders'
/** Opcional: catálogo do simulador pela API (sem ele, a vitrine pública, que a Shopify limita). */
export const ESCOPO_PRODUTOS = 'read_products'

const ESPERA_MS = 15_000
const SEM_CUPONS = `O app da Shopify ainda não tem a permissão de cupons (${ESCOPO_CUPONS}).`
const SEM_PEDIDOS = `O app da Shopify ainda não tem a permissão de leitura de pedidos (${ESCOPO_PEDIDOS}).`
const SEM_PRODUTOS = 'O app da Shopify ainda não tem a permissão de leitura de produtos (read_products).'

/** A Shopify devolve só o escopo mais forte: "write_x" já inclui "read_x". */
export function temEscopo(escopos: string | null | undefined, escopo: string): boolean {
  const lista = (escopos ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  return lista.includes(escopo) || (escopo.startsWith('read_') && lista.includes(escopo.replace(/^read_/, 'write_')))
}

/** Depois de quanto tempo vale pedir outro token só para ver se o app ganhou a permissão. */
const RECONFERIR_APOS_MS = 60 * 60_000

export type AcessoComEscopo =
  | { ok: true; acesso: AcessoShopify }
  | { ok: false; motivo: 'sem_conexao' | 'sem_permissao'; mensagem: string }

/**
 * Loja + token, já conferindo se o app tem o escopo. O token guarda os escopos do dia em que foi
 * emitido: se a permissão foi dada depois, pede outro (`conferir`: sempre; senão, no máximo 1x por hora).
 */
export async function acessoComEscopo(db: Banco, escopo: string, { conferir = false } = {}): Promise<AcessoComEscopo> {
  const semConexao = { ok: false as const, motivo: 'sem_conexao' as const, mensagem: 'A Shopify não está conectada. Conecte em Configurações › Shopify.' }
  const lerEscopos = async () => (await db.from('integracao_shopify').select('escopos, verificado_em').eq('id', 1).maybeSingle()).data

  let acesso = await acessoShopify(db)
  if (!acesso) return semConexao

  let conexao = await lerEscopos()
  if (!temEscopo(conexao?.escopos, escopo)) {
    const verificadoHa = conexao?.verificado_em ? Date.now() - new Date(conexao.verificado_em).getTime() : Infinity
    if (conferir || verificadoHa > RECONFERIR_APOS_MS) {
      acesso = await acessoShopify(db, { renovar: true })
      if (!acesso) return semConexao
      conexao = await lerEscopos()
    }
  }
  if (!temEscopo(conexao?.escopos, escopo)) {
    const mensagem = escopo === ESCOPO_CUPONS ? SEM_CUPONS : escopo === ESCOPO_PRODUTOS ? SEM_PRODUTOS : SEM_PEDIDOS
    return { ok: false, motivo: 'sem_permissao', mensagem }
  }
  return { ok: true, acesso }
}

// -----------------------------------------------------------------------------
// Loja
// -----------------------------------------------------------------------------

/** Nome e endereço público da loja (para o link de divulgação /discount/CUPOM). */
export async function lerLoja(acesso: AcessoShopify): Promise<{ nome: string; url: string }> {
  const dados = await graphql<{ shop: { name: string; primaryDomain: { url: string } } }>(acesso, '{ shop { name primaryDomain { url } } }', {}, ESPERA_MS)
  return { nome: dados.shop.name, url: dados.shop.primaryDomain.url.replace(/\/+$/, '') }
}

// -----------------------------------------------------------------------------
// Cupons
// -----------------------------------------------------------------------------

export type CupomNaShopify = {
  id: string
  titulo: string
  ativo: boolean
  /** null = cupom de outro tipo (valor fixo, frete grátis, leve X pague Y, app). */
  percentual: number | null
}

const BUSCAR_CUPOM = `query CupomPeloCodigo($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount {
      __typename
      ... on DiscountCodeBasic { title status customerGets { value { __typename ... on DiscountPercentage { percentage } } } }
      ... on DiscountCodeBxgy { title status }
      ... on DiscountCodeFreeShipping { title status }
      ... on DiscountCodeApp { title status }
    }
  }
}`

type RespostaBusca = {
  codeDiscountNodeByCode: {
    id: string
    codeDiscount: { __typename: string; title?: string; status?: string; customerGets?: { value?: { __typename: string; percentage?: number } | null } | null }
  } | null
}

/** Acha o cupom pelo código (a Shopify não diferencia maiúsculas de minúsculas). null = não existe. */
export async function buscarCupom(acesso: AcessoShopify, codigo: string): Promise<CupomNaShopify | null> {
  const dados = await graphql<RespostaBusca>(acesso, BUSCAR_CUPOM, { code: codigo }, ESPERA_MS, SEM_CUPONS)
  const no = dados.codeDiscountNodeByCode
  if (!no) return null
  const fracao = no.codeDiscount.customerGets?.value?.percentage
  return {
    id: no.id,
    titulo: no.codeDiscount.title ?? codigo,
    ativo: no.codeDiscount.status === 'ACTIVE',
    percentual: typeof fracao === 'number' ? Math.round(fracao * 10_000) / 100 : null,
  }
}

type ErrosDoCupom = Array<{ field?: string[] | null; message: string; code?: string | null }>

function recusaDoCupom(erros: ErrosDoCupom | undefined) {
  const erro = erros?.[0]
  if (!erro) return null
  if (erro.code === 'TAKEN') return new ErroShopify('Já existe um cupom com este código na Shopify.', 'recusou')
  return new ErroShopify(`A Shopify não aceitou o cupom: ${erro.message}`.slice(0, 300), 'recusou')
}

const valorDoCupom = (percentual: number) => ({ value: { percentage: Math.round(percentual * 100) / 10_000 }, items: { all: true } })

const CRIAR_CUPOM = `mutation CriarCupom($cupom: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $cupom) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`

/**
 * Cria o cupom de porcentagem na Shopify: vale para todos os produtos e clientes, sem limite de
 * usos, e soma com frete grátis (não soma com outros descontos de produto ou de pedido).
 */
export async function criarCupom(acesso: AcessoShopify, cupom: { codigo: string; percentual: number; influenciador: string }): Promise<string> {
  const dados = await graphql<{ discountCodeBasicCreate: { codeDiscountNode: { id: string } | null; userErrors: ErrosDoCupom } | null }>(
    acesso,
    CRIAR_CUPOM,
    {
      cupom: {
        title: `Influenciador · ${cupom.influenciador}`.slice(0, 255),
        code: cupom.codigo,
        startsAt: new Date().toISOString(),
        context: { all: 'ALL' },
        customerGets: valorDoCupom(cupom.percentual),
        appliesOncePerCustomer: false,
        combinesWith: { shippingDiscounts: true, productDiscounts: false, orderDiscounts: false },
      },
    },
    ESPERA_MS,
    SEM_CUPONS,
  )
  const recusa = recusaDoCupom(dados.discountCodeBasicCreate?.userErrors)
  if (recusa) throw recusa
  const id = dados.discountCodeBasicCreate?.codeDiscountNode?.id
  if (!id) throw new ErroShopify('A Shopify não confirmou a criação do cupom.', 'recusou')
  return id
}

const ATUALIZAR_CUPOM = `mutation AtualizarCupom($id: ID!, $cupom: DiscountCodeBasicInput!) {
  discountCodeBasicUpdate(id: $id, basicCodeDiscount: $cupom) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`

export async function atualizarDescontoDoCupom(acesso: AcessoShopify, id: string, percentual: number): Promise<void> {
  const dados = await graphql<{ discountCodeBasicUpdate: { userErrors: ErrosDoCupom } | null }>(
    acesso,
    ATUALIZAR_CUPOM,
    { id, cupom: { customerGets: valorDoCupom(percentual) } },
    ESPERA_MS,
    SEM_CUPONS,
  )
  const recusa = recusaDoCupom(dados.discountCodeBasicUpdate?.userErrors)
  if (recusa) throw recusa
}

const LIGAR_CUPOM = `mutation LigarCupom($id: ID!) { discountCodeActivate(id: $id) { codeDiscountNode { id } userErrors { field message code } } }`
const DESLIGAR_CUPOM = `mutation DesligarCupom($id: ID!) { discountCodeDeactivate(id: $id) { codeDiscountNode { id } userErrors { field message code } } }`

/** Liga ou desliga o cupom (desligado, ele continua existindo na Shopify, com o histórico). */
export async function definirCupomAtivo(acesso: AcessoShopify, id: string, ativo: boolean): Promise<void> {
  const dados = await graphql<Record<string, { userErrors: ErrosDoCupom } | null>>(acesso, ativo ? LIGAR_CUPOM : DESLIGAR_CUPOM, { id }, ESPERA_MS, SEM_CUPONS)
  const recusa = recusaDoCupom(dados[ativo ? 'discountCodeActivate' : 'discountCodeDeactivate']?.userErrors)
  if (recusa) throw recusa
}

// -----------------------------------------------------------------------------
// Pedidos
// -----------------------------------------------------------------------------

/** O que registrar_venda_influenciador() recebe (sem nenhum dado do cliente). */
export type PedidoDaShopify = {
  shopify_order_id: string
  pedido_numero: string | null
  pedido_em: string
  atualizado_em: string
  cupons: string[]
  status_financeiro: string | null
  cancelado: boolean
  teste: boolean
  base: number
  desconto: number
  frete: number
  valor_pedido: number
}

const PEDIDOS = `query PedidosDaLoja($query: String!, $after: String, $ordem: OrderSortKeys!) {
  orders(first: 100, after: $after, sortKey: $ordem, query: $query) {
    nodes {
      legacyResourceId
      name
      createdAt
      updatedAt
      cancelledAt
      test
      displayFinancialStatus
      discountCodes
      currentSubtotalPriceSet { shopMoney { amount } }
      currentTotalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      currentTotalPriceSet { shopMoney { amount } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

type Dinheiro = { shopMoney: { amount: string } } | null
type NoPedido = {
  legacyResourceId: string
  name: string | null
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
  test: boolean
  displayFinancialStatus: string | null
  discountCodes: string[]
  currentSubtotalPriceSet: Dinheiro
  currentTotalDiscountsSet: Dinheiro
  totalShippingPriceSet: Dinheiro
  currentTotalPriceSet: Dinheiro
}

const reais = (d: Dinheiro) => Number(d?.shopMoney.amount ?? 0) || 0

/** Uma página (até 100) de pedidos da loja. `consulta` usa a sintaxe de busca da Shopify. */
export async function listarPedidosDaLoja(
  acesso: AcessoShopify,
  consulta: string,
  { cursor = null, ordem = 'UPDATED_AT' }: { cursor?: string | null; ordem?: 'UPDATED_AT' | 'CREATED_AT' } = {},
): Promise<{ pedidos: PedidoDaShopify[]; proximo: string | null }> {
  const dados = await graphql<{ orders: { nodes: NoPedido[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(
    acesso,
    PEDIDOS,
    { query: consulta, after: cursor, ordem },
    ESPERA_MS,
    SEM_PEDIDOS,
  )
  return {
    pedidos: dados.orders.nodes.map((n) => ({
      shopify_order_id: String(n.legacyResourceId),
      pedido_numero: n.name,
      pedido_em: n.createdAt,
      atualizado_em: n.updatedAt,
      cupons: n.discountCodes ?? [],
      // PAID → paid, PARTIALLY_REFUNDED → partially_refunded… (mesmos nomes do webhook)
      status_financeiro: n.displayFinancialStatus?.toLowerCase() ?? null,
      cancelado: Boolean(n.cancelledAt),
      teste: Boolean(n.test),
      base: reais(n.currentSubtotalPriceSet),
      desconto: reais(n.currentTotalDiscountsSet),
      frete: reais(n.totalShippingPriceSet),
      valor_pedido: reais(n.currentTotalPriceSet),
    })),
    proximo: dados.orders.pageInfo.hasNextPage ? dados.orders.pageInfo.endCursor : null,
  }
}

// -----------------------------------------------------------------------------
// Webhook (orders/*): mesmo formato, a partir do corpo REST
// -----------------------------------------------------------------------------

type PedidoDoWebhook = {
  id?: number | string
  name?: string | null
  created_at?: string | null
  updated_at?: string | null
  cancelled_at?: string | null
  test?: boolean | null
  financial_status?: string | null
  discount_codes?: Array<{ code?: string | null }> | null
  current_subtotal_price?: string | null
  subtotal_price?: string | null
  current_total_discounts?: string | null
  total_discounts?: string | null
  current_total_price?: string | null
  total_price?: string | null
  total_shipping_price_set?: { shop_money?: { amount?: string | null } | null } | null
}

/** Pedido do webhook da Shopify → venda. null = pedido sem cupom (nada a registrar). */
export function pedidoDoWebhook(p: PedidoDoWebhook): PedidoDaShopify | null {
  const cupons = (p.discount_codes ?? []).map((c) => c.code ?? '').filter(Boolean)
  if (!p.id || cupons.length === 0) return null
  const numero = (v: string | null | undefined) => Number(v ?? 0) || 0
  return {
    shopify_order_id: String(p.id),
    pedido_numero: p.name ?? null,
    pedido_em: p.created_at ?? new Date().toISOString(),
    atualizado_em: p.updated_at ?? new Date().toISOString(),
    cupons,
    status_financeiro: p.financial_status ?? null,
    cancelado: Boolean(p.cancelled_at),
    teste: Boolean(p.test),
    base: numero(p.current_subtotal_price ?? p.subtotal_price),
    desconto: numero(p.current_total_discounts ?? p.total_discounts),
    frete: numero(p.total_shipping_price_set?.shop_money?.amount),
    valor_pedido: numero(p.current_total_price ?? p.total_price),
  }
}
