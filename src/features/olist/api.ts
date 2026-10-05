import 'server-only'

import { lerDinheiro } from '@/lib/format'

/**
 * Cliente da API v3 do Olist ERP — só o que o CRM usa (listar pedidos de venda).
 * Doc: https://api-docs.erp.olist.com/api-reference/pedidos/listar-pedidos
 */

const API = 'https://api.tiny.com.br/public-api/v3'
const POR_PAGINA = 100
const MAX_TENTATIVAS = 4

export type PedidoOlist = {
  id: number
  numeroPedido?: number | null
  situacao?: number | null
  dataCriacao?: string | null
  valor?: string | number | null
  ecommerce?: { id?: number | null; nome?: string | null; canalVenda?: string | null } | null
}

export type CanalErp = 'mercado_livre' | 'shopee' | 'shopify' | 'outro' | 'sem_ecommerce'

/** Canal do painel a partir do e-commerce do pedido no Olist ("API Tiny" e demais = outro). */
export function canalDoEcommerce(ecommerce: PedidoOlist['ecommerce']): CanalErp {
  const texto = [ecommerce?.nome, ecommerce?.canalVenda].filter(Boolean).join(' ')
  if (!texto.trim()) return 'sem_ecommerce'
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (t.includes('mercado livre') || t.includes('mercadolivre') || t.includes('mercado_livre')) return 'mercado_livre'
  if (t.includes('shopee')) return 'shopee'
  if (t.includes('shopify')) return 'shopify'
  return 'outro'
}

/** "2026-10-05", "2026-10-05 14:30:00" ou "05/10/2026" → "2026-10-05" (null se inválida). */
export function dataDoPedido(valor: string | null | undefined): string | null {
  if (!valor) return null
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

export function valorDoPedido(valor: PedidoOlist['valor']): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  if (!valor) return 0
  const n = /,/.test(valor) ? lerDinheiro(valor) : Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** Linha da tabela pedidos_erp (null se o pedido vier sem data). */
export function paraPedidoErp(p: PedidoOlist, sincronizadoEm: string) {
  const data = dataDoPedido(p.dataCriacao)
  if (!data || typeof p.id !== 'number') return null
  return {
    id: p.id,
    numero: p.numeroPedido ?? null,
    canal: canalDoEcommerce(p.ecommerce),
    ecommerce: p.ecommerce?.nome?.trim() || null,
    situacao: p.situacao ?? 0,
    data_pedido: data,
    valor: valorDoPedido(p.valor),
    sincronizado_em: sincronizadoEm,
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(caminho: string, accessToken: string): Promise<unknown> {
  for (let tentativa = 1; ; tentativa++) {
    const resposta = await fetch(`${API}${caminho}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (resposta.ok) return resposta.json()

    // Limite de requisições (por conta): espera o reset informado pela API e tenta de novo.
    if (resposta.status === 429 && tentativa < MAX_TENTATIVAS) {
      const reset = Number(resposta.headers.get('X-RateLimit-Reset'))
      await esperar(Math.min(Number.isFinite(reset) && reset > 0 ? reset : 5, 60) * 1000)
      continue
    }
    if (resposta.status >= 500 && tentativa < MAX_TENTATIVAS) {
      await esperar(1000 * tentativa)
      continue
    }
    const detalhe = await resposta.text().catch(() => '')
    if (resposta.status === 401) throw new Error('Olist recusou o token de acesso (401).')
    throw new Error(`Olist respondeu ${resposta.status} em ${caminho.split('?')[0]}: ${detalhe.slice(0, 200)}`)
  }
}

/**
 * Todos os pedidos de venda que atendem ao filtro (paginado de 100 em 100).
 * Datas: "AAAA-MM-DD"; dataAtualizacao aceita "AAAA-MM-DD HH:mm:ss" (horário de Brasília).
 */
export async function listarPedidos(
  accessToken: string,
  filtro: { dataInicial?: string; dataFinal?: string; dataAtualizacao?: string },
): Promise<PedidoOlist[]> {
  const pedidos: PedidoOlist[] = []
  for (let offset = 0; ; offset += POR_PAGINA) {
    const params = new URLSearchParams({ limit: String(POR_PAGINA), offset: String(offset), orderBy: 'asc' })
    for (const [chave, valor] of Object.entries(filtro)) if (valor) params.set(chave, valor)
    const pagina = (await get(`/pedidos?${params}`, accessToken)) as {
      itens?: PedidoOlist[]
      paginacao?: { total?: number }
    }
    const itens = pagina.itens ?? []
    pedidos.push(...itens)
    const total = pagina.paginacao?.total ?? 0
    if (itens.length < POR_PAGINA || offset + POR_PAGINA >= total) return pedidos
  }
}
