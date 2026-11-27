import 'server-only'

import { graphql, type AcessoShopify } from '@/features/shopify/api'

import { sugerirTipo, type TipoColecao } from './classificacao'

/**
 * Clientes por estilo × Admin API da Shopify (o mesmo app do frete e dos influenciadores).
 *   • Collections: título e algumas marcas de produtos (para sugerir o tipo). Escopo read_products.
 *   • Produtos: as collections de cada produto comprado. Escopo read_products.
 *   • Pedidos: itens, situação e o comprador (nome, WhatsApp, e-mail, cidade). Escopo read_orders
 *     (60 dias) ou read_all_orders (desde o 1º pedido); o cadastro do cliente pede read_customers.
 * Docs: https://shopify.dev/docs/api/admin-graphql/latest/queries/orders
 */

const ESPERA_MS = 20_000
const SEM_PEDIDOS = 'O app da Shopify ainda não tem a permissão de leitura de pedidos (read_orders).'
const SEM_PRODUTOS = 'O app da Shopify ainda não tem a permissão de leitura de produtos (read_products), que traz as collections.'

const gid = (tipo: 'Product' | 'Order', id: string) => `gid://shopify/${tipo}/${id}`

// -----------------------------------------------------------------------------
// Collections
// -----------------------------------------------------------------------------

export type ColecaoDaLoja = { id: string; titulo: string; handle: string; produtos: number; tipo: TipoColecao }

const COLECOES = `query ColecoesDaLoja($after: String) {
  collections(first: 100, after: $after, sortKey: TITLE) {
    nodes { legacyResourceId title handle productsCount { count } products(first: 5) { nodes { vendor } } }
    pageInfo { hasNextPage endCursor }
  }
}`

type RespostaColecoes = {
  collections: {
    nodes: Array<{ legacyResourceId: string; title: string; handle: string; productsCount: { count: number } | null; products: { nodes: Array<{ vendor: string | null }> } }>
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

/** Todas as collections da loja, com o tipo sugerido. */
export async function listarColecoes(acesso: AcessoShopify): Promise<ColecaoDaLoja[]> {
  const colecoes: ColecaoDaLoja[] = []
  let cursor: string | null = null
  for (let pagina = 0; pagina < 20; pagina++) {
    const dados: RespostaColecoes = await graphql<RespostaColecoes>(acesso, COLECOES, { after: cursor }, ESPERA_MS, SEM_PRODUTOS)
    for (const c of dados.collections.nodes) {
      colecoes.push({
        id: String(c.legacyResourceId),
        titulo: c.title.trim(),
        handle: c.handle,
        produtos: c.productsCount?.count ?? 0,
        tipo: sugerirTipo(c.title, c.products.nodes.map((p) => p.vendor)),
      })
    }
    if (!dados.collections.pageInfo.hasNextPage) return colecoes
    cursor = dados.collections.pageInfo.endCursor
  }
  throw new Error('A loja tem collections demais para ler de uma vez.')
}

// -----------------------------------------------------------------------------
// Produtos
// -----------------------------------------------------------------------------

export type ProdutoDaLoja = { id: string; titulo: string; marca: string | null; colecao_ids: string[] } | { id: string; removido: true }

const PRODUTOS = `query ProdutosComColecoes($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product { legacyResourceId title vendor collections(first: 30) { nodes { legacyResourceId } } }
  }
}`

type NoProduto = { legacyResourceId?: string; title?: string; vendor?: string | null; collections?: { nodes: Array<{ legacyResourceId: string }> } } | null

/** Até 25 produtos por chamada. Produto apagado da loja volta como `removido`. */
export const PRODUTOS_POR_CHAMADA = 25

export async function lerProdutos(acesso: AcessoShopify, ids: string[]): Promise<ProdutoDaLoja[]> {
  const dados = await graphql<{ nodes: NoProduto[] }>(acesso, PRODUTOS, { ids: ids.map((id) => gid('Product', id)) }, ESPERA_MS, SEM_PRODUTOS)
  return ids.map((id, i) => {
    const no = dados.nodes[i]
    if (!no?.legacyResourceId) return { id, removido: true as const }
    return {
      id,
      titulo: no.title ?? '',
      marca: no.vendor ?? null,
      colecao_ids: (no.collections?.nodes ?? []).map((c) => String(c.legacyResourceId)),
    }
  })
}

// -----------------------------------------------------------------------------
// Pedidos
// -----------------------------------------------------------------------------

/** O que registrar_compras_shopify() recebe. */
export type CompraDaLoja = {
  id: string
  numero: string | null
  comprado_em: string
  atualizado_em: string
  status_financeiro: string | null
  cancelado: boolean
  teste: boolean
  valor: number
  cliente: {
    shopify_customer_id: string | null
    nome: string | null
    whatsapp: string | null
    email: string | null
    cidade: string | null
    uf: string | null
    cep: string | null
  }
  itens: Array<{ produto_id: string | null; titulo: string; quantidade: number }>
}

type Endereco = { name: string | null; phone: string | null; city: string | null; provinceCode: string | null; zip: string | null } | null
type ItemDoPedido = { title: string; currentQuantity: number; product: { legacyResourceId: string } | null }
type PaginaDeItens = { nodes: ItemDoPedido[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
type NoPedido = {
  legacyResourceId: string
  name: string | null
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
  test: boolean
  displayFinancialStatus: string | null
  email: string | null
  phone: string | null
  currentTotalPriceSet: { shopMoney: { amount: string } } | null
  shippingAddress: Endereco
  billingAddress: Endereco
  customer?: {
    legacyResourceId: string
    firstName: string | null
    lastName: string | null
    defaultEmailAddress: { emailAddress: string | null } | null
    defaultPhoneNumber: { phoneNumber: string | null } | null
  } | null
  lineItems: PaginaDeItens
}

const ITENS = 'nodes { title currentQuantity product { legacyResourceId } } pageInfo { hasNextPage endCursor }'
const ENDERECO = '{ name phone city provinceCode zip }'
const CLIENTE = 'customer { legacyResourceId firstName lastName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } }'

/** 20 pedidos × 30 itens cabe no limite de custo de uma consulta (1.000 pontos). */
const consultaDePedidos = (comCliente: boolean) => `query PedidosDaLoja($query: String, $after: String) {
  orders(first: 20, after: $after, sortKey: UPDATED_AT, query: $query) {
    nodes {
      legacyResourceId name createdAt updatedAt cancelledAt test displayFinancialStatus email phone
      currentTotalPriceSet { shopMoney { amount } }
      shippingAddress ${ENDERECO}
      billingAddress ${ENDERECO}
      ${comCliente ? CLIENTE : ''}
      lineItems(first: 30) { ${ITENS} }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const MAIS_ITENS = `query ItensDoPedido($id: ID!, $after: String) { order(id: $id) { lineItems(first: 100, after: $after) { ${ITENS} } } }`

const texto = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

function compraDoPedido(n: NoPedido, itens: ItemDoPedido[]): CompraDaLoja {
  const entrega = n.shippingAddress ?? n.billingAddress
  const nomeDoCadastro = [n.customer?.firstName, n.customer?.lastName].map(texto).filter(Boolean).join(' ')
  return {
    id: String(n.legacyResourceId),
    numero: n.name,
    comprado_em: n.createdAt,
    atualizado_em: n.updatedAt,
    // PAID → paid, PARTIALLY_REFUNDED → partially_refunded…
    status_financeiro: n.displayFinancialStatus?.toLowerCase() ?? null,
    cancelado: Boolean(n.cancelledAt),
    teste: Boolean(n.test),
    valor: Number(n.currentTotalPriceSet?.shopMoney.amount ?? 0) || 0,
    cliente: {
      shopify_customer_id: n.customer?.legacyResourceId ? String(n.customer.legacyResourceId) : null,
      nome: texto(nomeDoCadastro) ?? texto(n.shippingAddress?.name) ?? texto(n.billingAddress?.name),
      // O telefone da entrega é o que o cliente digita no checkout (costuma ser o celular).
      whatsapp:
        texto(n.shippingAddress?.phone) ?? texto(n.phone) ?? texto(n.customer?.defaultPhoneNumber?.phoneNumber) ?? texto(n.billingAddress?.phone),
      email: texto(n.email) ?? texto(n.customer?.defaultEmailAddress?.emailAddress),
      cidade: texto(entrega?.city),
      uf: texto(entrega?.provinceCode),
      cep: texto(entrega?.zip),
    },
    itens: itens
      .filter((i) => i.currentQuantity > 0)
      .map((i) => ({ produto_id: i.product?.legacyResourceId ? String(i.product.legacyResourceId) : null, titulo: i.title, quantidade: i.currentQuantity })),
  }
}

/**
 * Uma página (até 20) de pedidos, do atualizado há mais tempo ao mais recente.
 * `consulta`: sintaxe de busca da Shopify (ex.: updated_at:>='…'); nulo = todos.
 * `comCliente`: o app tem read_customers (traz o ID e o cadastro do cliente).
 */
export async function listarCompras(
  acesso: AcessoShopify,
  consulta: string | null,
  { cursor = null, comCliente }: { cursor?: string | null; comCliente: boolean },
): Promise<{ compras: CompraDaLoja[]; proximo: string | null }> {
  const dados = await graphql<{ orders: { nodes: NoPedido[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(
    acesso,
    consultaDePedidos(comCliente),
    { query: consulta, after: cursor },
    ESPERA_MS,
    SEM_PEDIDOS,
  )

  const compras: CompraDaLoja[] = []
  for (const pedido of dados.orders.nodes) {
    const itens = [...pedido.lineItems.nodes]
    let pagina = pedido.lineItems.pageInfo
    // Pedido com mais de 30 itens (kits grandes): busca o resto.
    while (pagina.hasNextPage) {
      const resto: { order: { lineItems: PaginaDeItens } | null } = await graphql<{ order: { lineItems: PaginaDeItens } | null }>(
        acesso,
        MAIS_ITENS,
        { id: gid('Order', pedido.legacyResourceId), after: pagina.endCursor },
        ESPERA_MS,
        SEM_PEDIDOS,
      )
      if (!resto.order) break
      itens.push(...resto.order.lineItems.nodes)
      pagina = resto.order.lineItems.pageInfo
    }
    compras.push(compraDoPedido(pedido, itens))
  }
  return { compras, proximo: dados.orders.pageInfo.hasNextPage ? dados.orders.pageInfo.endCursor : null }
}
