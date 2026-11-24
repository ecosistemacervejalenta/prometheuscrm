import 'server-only'

import { after } from 'next/server'

import { envServidor } from '@/lib/env.server'
import { urlDaRequisicao } from '@/lib/url'

import type { ProdutoLoteOlist, ProdutoOlist } from './api'
import type { DetalheBuscaOlist, PaginaBuscaComEstoque } from './estoque'

/**
 * A tela não lê a chave secreta nem os tokens da Olist: pede à rotina /api/cron/olist-estoque
 * (autenticada com CRON_SECRET) — o mesmo padrão da sincronização e dos marketplaces.
 */

export type PedidoRotinaEstoque =
  | { acao: 'buscar'; termo: string; offset?: number }
  | { acao: 'produto'; id: number }
  | { acao: 'detalhes'; ids: number[] }
  | { acao: 'processar' }
  // Lotes e validades (só consulta): produto pelo SKU, ou pelo id para reler nome e estoque.
  | { acao: 'lote-sku'; sku: string }
  | { acao: 'lote-produto'; id: number }

export type RespostaRotinaEstoque =
  | ({ ok: true } & PaginaBuscaComEstoque)
  | { ok: true; produto: ProdutoOlist }
  | { ok: true; detalhes: DetalheBuscaOlist[] }
  | { ok: true; produtoLote: ProdutoLoteOlist | null }
  | { ok: boolean; mensagem: string }

export async function pedirARotinaEstoque(pedido: PedidoRotinaEstoque, site?: string): Promise<RespostaRotinaEstoque> {
  if (!envServidor.cronSecret) return { ok: false, mensagem: 'Configure CRON_SECRET na Vercel para usar o estoque da Olist.' }
  try {
    const resposta = await fetch(`${site ?? (await urlDaRequisicao())}/api/cron/olist-estoque`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${envServidor.cronSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
      cache: 'no-store',
    })
    const corpo = (await resposta.json().catch(() => null)) as RespostaRotinaEstoque | null
    if (!resposta.ok || typeof corpo?.ok !== 'boolean') {
      console.error('[olist-estoque] rotina respondeu', resposta.status, corpo)
      return { ok: false, mensagem: `A rotina do estoque recusou o pedido (HTTP ${resposta.status}).` }
    }
    return corpo
  } catch (erro) {
    console.error('[olist-estoque] rotina indisponível', erro)
    return { ok: false, mensagem: 'Não foi possível falar com a rotina do estoque. Tente de novo em instantes.' }
  }
}

/**
 * Depois de uma ação da equipe que mexe em pedidos de pré-venda (cancelar, excluir, pedido
 * manual...), envia a fila de estoque à Olist sem segurar a resposta. Se falhar, a rotina
 * de 5 min envia.
 */
export async function agendarEnvioEstoqueOlist() {
  if (!envServidor.cronSecret) return
  const site = await urlDaRequisicao()
  after(async () => {
    await pedirARotinaEstoque({ acao: 'processar' }, site)
  })
}
