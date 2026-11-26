import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { ErroShopify, graphql, type AcessoShopify } from '@/features/shopify/api'
import type { Database } from '@/types/database.types'

import { acessoComEscopo, ESCOPO_PEDIDOS, ESCOPO_PRODUTOS } from './shopify'

/**
 * Produtos e pedidos REAIS da loja para o simulador do cadastro de influenciadores.
 *   • Catálogo: pela Admin API quando o app tem read_products (o caminho confiável); sem essa
 *     permissão, pela vitrine pública (/products.json), que a Shopify limita para servidores
 *     (HTTP 429 depois de poucas leituras). Produtos ativos, com preço. Fica em memória por 20 min.
 *   • Pedidos recentes: Admin API (read_orders), só os itens e valores — nenhum dado do cliente.
 */

type Banco = SupabaseClient<Database>

export type ProdutoDaLoja = {
  /** Variante da Shopify (cada tamanho/opção é um produto à parte no simulador). */
  id: string
  titulo: string
  preco: number
  /** Preço "de" riscado na loja (compare at), quando maior que o preço. */
  precoDe: number | null
  imagem: string | null
  sku: string | null
  disponivel: boolean
}

const VALIDADE_MS = 20 * 60_000
const MAX_PAGINAS = 12
const ESPERA_MS = 10_000
/** A vitrine limita pedidos seguidos (HTTP 429): espera e tenta de novo algumas vezes. */
const TENTATIVAS = 4
const PAUSA_ENTRE_PAGINAS_MS = 250

const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let emMemoria: { loja: string; expira: number; produtos: ProdutoDaLoja[] } | null = null
let carregando: { loja: string; promessa: Promise<ProdutoDaLoja[]> } | null = null

const VARIANTES = `query VariantesDaLoja($after: String) {
  productVariants(first: 100, after: $after, query: "product_status:active") {
    nodes {
      legacyResourceId
      title
      sku
      price
      compareAtPrice
      availableForSale
      product { title featuredMedia { preview { image { url } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

type NoDaVariante = {
  legacyResourceId: string
  title: string
  sku: string | null
  price: string
  compareAtPrice: string | null
  availableForSale: boolean
  product: { title: string; featuredMedia: { preview: { image: { url: string } | null } | null } | null }
}

/** Catálogo pela Admin API (read_products): 100 variantes por página, esperando quando a Shopify pede. */
async function catalogoPelaApi(acesso: AcessoShopify): Promise<ProdutoDaLoja[]> {
  const produtos: ProdutoDaLoja[] = []
  let cursor: string | null = null
  for (let pagina = 0; pagina < 30; pagina++) {
    let dados: { productVariants: { nodes: NoDaVariante[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null = null
    for (let tentativa = 1; !dados; tentativa++) {
      try {
        dados = await graphql(acesso, VARIANTES, { after: cursor }, ESPERA_MS, 'O app da Shopify ainda não tem a permissão de leitura de produtos (read_products).')
      } catch (e) {
        // "Muitas consultas seguidas" (THROTTLED) ou instabilidade: espera e tenta de novo.
        if (!(e instanceof ErroShopify) || e.tipo !== 'fora_do_ar' || tentativa >= TENTATIVAS) throw e
        await pausa(1500 * tentativa)
      }
    }
    for (const v of dados.productVariants.nodes) {
      const preco = Number(v.price)
      if (!(preco > 0)) continue
      const precoDe = Number(v.compareAtPrice)
      const nomeDaVariante = v.title && v.title !== 'Default Title' ? ` · ${v.title}` : ''
      produtos.push({
        id: String(v.legacyResourceId),
        titulo: `${v.product.title}${nomeDaVariante}`.trim(),
        preco,
        precoDe: precoDe > preco ? precoDe : null,
        imagem: miniatura(v.product.featuredMedia?.preview?.image?.url),
        sku: v.sku?.trim() || null,
        disponivel: v.availableForSale,
      })
    }
    if (!dados.productVariants.pageInfo.hasNextPage) break
    cursor = dados.productVariants.pageInfo.endCursor
  }
  return produtos.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

type VarianteDaVitrine = { id: number; title: string; price: string; compare_at_price: string | null; sku: string | null; available: boolean; featured_image?: { src: string } | null }
type ProdutoDaVitrine = { id: number; title: string; images?: Array<{ src: string }>; variants: VarianteDaVitrine[] }

/** Miniatura pela própria CDN da Shopify (aceita ?width=). */
export function miniatura(url: string | null | undefined, largura = 120): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    u.searchParams.set('width', String(largura))
    return u.toString()
  } catch {
    return url
  }
}

/** Uma página da vitrine, com nova tentativa quando a loja pede para esperar (429) ou falha (5xx). */
async function lerPagina(loja: string, pagina: number): Promise<ProdutoDaVitrine[]> {
  for (let tentativa = 1; ; tentativa++) {
    const resposta = await fetch(`https://${loja}.myshopify.com/products.json?limit=250&page=${pagina}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'PrometheusCRM/1.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(ESPERA_MS),
    })
    if (resposta.ok) return ((await resposta.json()) as { products?: ProdutoDaVitrine[] }).products ?? []
    if (resposta.status === 401 || resposta.status === 403) throw new Error('A vitrine da loja está fechada (senha) e o catálogo não pôde ser lido.')
    const passageiro = resposta.status === 429 || resposta.status >= 500
    if (!passageiro || tentativa >= TENTATIVAS) {
      throw new Error(
        resposta.status === 429
          ? 'A loja está recebendo muitos acessos e não devolveu o catálogo agora. Tente de novo em 1 minuto.'
          : `A loja não devolveu o catálogo (HTTP ${resposta.status}).`,
      )
    }
    const pedida = Number(resposta.headers.get('retry-after'))
    await pausa(Number.isFinite(pedida) && pedida > 0 ? Math.min(pedida, 5) * 1000 : 800 * tentativa)
  }
}

async function baixarCatalogo(loja: string): Promise<ProdutoDaLoja[]> {
  const produtos: ProdutoDaLoja[] = []
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    if (pagina > 1) await pausa(PAUSA_ENTRE_PAGINAS_MS)
    const products = await lerPagina(loja, pagina)

    for (const p of products ?? []) {
      const variantes = p.variants ?? []
      for (const v of variantes) {
        const preco = Number(v.price)
        if (!(preco > 0)) continue
        const precoDe = Number(v.compare_at_price)
        const nomeDaVariante = variantes.length > 1 && v.title && v.title !== 'Default Title' ? ` · ${v.title}` : ''
        produtos.push({
          id: String(v.id),
          titulo: `${p.title}${nomeDaVariante}`.trim(),
          preco,
          precoDe: precoDe > preco ? precoDe : null,
          imagem: miniatura(v.featured_image?.src ?? p.images?.[0]?.src),
          sku: v.sku?.trim() || null,
          disponivel: Boolean(v.available),
        })
      }
    }
    if (products.length < 250) break
  }
  return produtos.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

/** Pela Admin API se o app pode ler produtos; senão, pela vitrine. */
async function lerCatalogo(db: Banco, loja: string): Promise<ProdutoDaLoja[]> {
  const permissao = await acessoComEscopo(db, ESCOPO_PRODUTOS)
  if (permissao.ok) return catalogoPelaApi(permissao.acesso)
  return baixarCatalogo(loja)
}

/**
 * Catálogo da loja (variantes ativas com preço), guardado por 20 min.
 * Se a leitura nova falhar, continua usando o último catálogo bom.
 */
export async function catalogoDaLoja(db: Banco, loja: string): Promise<ProdutoDaLoja[]> {
  if (emMemoria?.loja === loja && emMemoria.expira > Date.now()) return emMemoria.produtos
  if (carregando?.loja === loja) return carregando.promessa

  const anterior = emMemoria?.loja === loja ? emMemoria.produtos : null
  const promessa = lerCatalogo(db, loja)
    .then((produtos) => {
      emMemoria = { loja, expira: Date.now() + VALIDADE_MS, produtos }
      return produtos
    })
    .catch((e) => {
      if (anterior) {
        console.error('[influenciadores] catálogo: usando o anterior', e instanceof Error ? e.message : e)
        return anterior
      }
      throw e
    })
    .finally(() => {
      carregando = null
    })
  carregando = { loja, promessa }
  return promessa
}

export type ItemDePedido = { titulo: string; sku: string | null; preco: number; quantidade: number; imagem: string | null }

export type PedidoRecente = {
  numero: string
  criadoEm: string
  situacao: string | null
  cancelado: boolean
  cupons: string[]
  produtos: number
  itens: ItemDePedido[]
}

const PEDIDOS_RECENTES = `query PedidosRecentes {
  orders(first: 12, sortKey: CREATED_AT, reverse: true, query: "test:false") {
    nodes {
      name
      createdAt
      cancelledAt
      displayFinancialStatus
      discountCodes
      lineItems(first: 50) {
        nodes { title variantTitle sku quantity originalUnitPriceSet { shopMoney { amount } } image { url } }
      }
    }
  }
}`

type NoDoPedido = {
  name: string
  createdAt: string
  cancelledAt: string | null
  displayFinancialStatus: string | null
  discountCodes: string[]
  lineItems: {
    nodes: Array<{ title: string; variantTitle: string | null; sku: string | null; quantity: number; originalUnitPriceSet: { shopMoney: { amount: string } }; image: { url: string } | null }>
  }
}

/** Os últimos pedidos da loja (só itens e valores), para carregar no simulador como exemplo real. */
export async function pedidosRecentesDaLoja(db: Banco): Promise<{ ok: true; pedidos: PedidoRecente[] } | { ok: false; mensagem: string }> {
  try {
    const permissao = await acessoComEscopo(db, ESCOPO_PEDIDOS)
    if (!permissao.ok) return { ok: false, mensagem: permissao.mensagem }

    const dados = await graphql<{ orders: { nodes: NoDoPedido[] } }>(
      permissao.acesso,
      PEDIDOS_RECENTES,
      {},
      ESPERA_MS,
      'O app da Shopify ainda não tem a permissão de leitura de pedidos (read_orders).',
    )
    const pedidos = dados.orders.nodes
      .map((p): PedidoRecente => {
        const itens = p.lineItems.nodes
          .filter((i) => i.quantity > 0)
          .map((i) => ({
            titulo: [i.title, i.variantTitle && i.variantTitle !== 'Default Title' ? i.variantTitle : null].filter(Boolean).join(' · '),
            sku: i.sku?.trim() || null,
            preco: Number(i.originalUnitPriceSet.shopMoney.amount) || 0,
            quantidade: i.quantity,
            imagem: miniatura(i.image?.url),
          }))
          .filter((i) => i.preco > 0)
        return {
          numero: p.name,
          criadoEm: p.createdAt,
          situacao: p.displayFinancialStatus,
          cancelado: Boolean(p.cancelledAt),
          cupons: p.discountCodes ?? [],
          produtos: Math.round(itens.reduce((s, i) => s + i.preco * i.quantidade, 0) * 100) / 100,
          itens,
        }
      })
      .filter((p) => p.itens.length > 0)
    return { ok: true, pedidos }
  } catch (e) {
    if (!(e instanceof ErroShopify)) console.error('[influenciadores] pedidos recentes', e)
    return { ok: false, mensagem: e instanceof ErroShopify ? e.message : 'Não foi possível ler os pedidos da loja agora.' }
  }
}
