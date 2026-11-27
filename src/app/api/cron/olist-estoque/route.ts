import { NextResponse, type NextRequest } from 'next/server'

import { verificarChave } from '@/features/integracoes/api-auth'
import { processarAvisosDeValidade } from '@/features/lotes/avisos'
import {
  atualizarEstoqueDasCervejasDosLotes,
  consultarGtinNaOlist,
  consultarProdutoLoteNaOlist,
  consultarSkuNaOlist,
  enviarBalancoParaOlist,
} from '@/features/lotes/olist'
import { codigoDeBarras } from '@/features/lotes/schema'
import { buscarNaOlist, detalhesNaOlist, prepararProdutoOlist, processarFilaEstoqueOlist, rotinaEstoqueOlist } from '@/features/olist/estoque'
import type { PedidoRotinaEstoque, RespostaRotinaEstoque } from '@/features/olist/rotina-estoque'
import { OlistNaoConectado } from '@/features/olist/token'
import { envServidor } from '@/lib/env.server'
import { urlDoSite } from '@/lib/url'

export const maxDuration = 300

/**
 * Estoque da Olist nas pré-vendas (única rota da tela que usa os tokens da Olist).
 *   GET  → Vercel Cron a cada 5 min (vercel.ts): vence caixas sem pagamento, envia a fila de
 *          lançamentos e atualiza o estoque das pré-vendas ativas. No fim, relê o estoque de
 *          algumas cervejas do módulo Lotes e validades (só consulta) e manda ao n8n os avisos de
 *          validade dos lotes (grupo da equipe), das 8h às 20h.
 *   POST → pedidos da tela: { acao: 'buscar', termo, offset? } | { acao: 'detalhes', ids } | { acao: 'produto', id } |
 *          { acao: 'processar' } | { acao: 'lote-sku', sku } | { acao: 'lote-gtin', gtin } | { acao: 'lote-produto', id } |
 *          { acao: 'lote-balanco', balanco } (envia à Olist o balanço registrado em lotes_balancos).
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  let resposta: Record<string, unknown>
  let status = 200
  try {
    const rotina = await rotinaEstoqueOlist()
    // Só depois das pré-vendas, e só se a Olist estiver respondendo: é o menos urgente.
    const lotes = rotina.ok
      ? await atualizarEstoqueDasCervejasDosLotes().catch((e) => {
          if (!(e instanceof OlistNaoConectado)) console.error('[lotes] leitura do estoque', e)
          return 0
        })
      : 0
    resposta = { ...rotina, lotes }
  } catch (e) {
    console.error('[olist-estoque] rotina falhou', e)
    resposta = { ok: false, motivo: e instanceof Error ? e.message : 'erro' }
    status = 502
  }

  // Avisos de validade no grupo (pelo n8n): rodam mesmo se a Olist falhar.
  const avisos = await urlDoSite()
    .then((site) => processarAvisosDeValidade(site))
    .catch((e) => {
      console.error('[lotes] avisos de validade', e)
      return null
    })
  return NextResponse.json({ ...resposta, avisos }, { status })
}

export async function POST(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const pedido = (await request.json().catch(() => null)) as PedidoRotinaEstoque | null
  let resposta: RespostaRotinaEstoque
  try {
    switch (pedido?.acao) {
      case 'buscar':
        resposta = {
          ok: true,
          ...(await buscarNaOlist(String(pedido.termo ?? '').trim().slice(0, 80), Math.max(0, Math.floor(Number(pedido.offset) || 0)))),
        }
        break
      case 'produto':
        if (!Number.isSafeInteger(pedido.id) || pedido.id <= 0) return NextResponse.json({ ok: false, mensagem: 'Produto inválido.' }, { status: 400 })
        resposta = { ok: true, produto: await prepararProdutoOlist(pedido.id) }
        break
      case 'detalhes': {
        const ids = Array.isArray(pedido.ids) ? pedido.ids.filter((id) => Number.isSafeInteger(id) && id > 0) : []
        resposta = { ok: true, detalhes: await detalhesNaOlist(ids) }
        break
      }
      case 'processar': {
        const fila = await processarFilaEstoqueOlist()
        resposta = { ok: fila.ok, mensagem: fila.motivo ?? `${fila.lancamentos} lançamento(s) enviados à Olist.` }
        break
      }
      case 'lote-sku': {
        const sku = String(pedido.sku ?? '').trim().slice(0, 60)
        if (!sku) return NextResponse.json({ ok: false, mensagem: 'Informe o SKU.' }, { status: 400 })
        resposta = { ok: true, produtoAchado: await consultarSkuNaOlist(sku) }
        break
      }
      case 'lote-gtin': {
        const gtin = codigoDeBarras(String(pedido.gtin ?? ''))
        if (!gtin) return NextResponse.json({ ok: false, mensagem: 'Código de barras inválido.' }, { status: 400 })
        resposta = { ok: true, produtosGtin: await consultarGtinNaOlist(gtin) }
        break
      }
      case 'lote-produto':
        if (!Number.isSafeInteger(pedido.id) || pedido.id <= 0) return NextResponse.json({ ok: false, mensagem: 'Produto inválido.' }, { status: 400 })
        resposta = { ok: true, produtoLote: await consultarProdutoLoteNaOlist(pedido.id) }
        break
      case 'lote-balanco':
        if (!Number.isSafeInteger(pedido.balanco) || pedido.balanco <= 0) return NextResponse.json({ ok: false, mensagem: 'Balanço inválido.' }, { status: 400 })
        resposta = { ok: true, balanco: await enviarBalancoParaOlist(pedido.balanco) }
        break
      default:
        return NextResponse.json({ ok: false, mensagem: 'Pedido inválido.' }, { status: 400 })
    }
  } catch (e) {
    if (!(e instanceof OlistNaoConectado)) console.error('[olist-estoque] pedido falhou', pedido?.acao, e)
    resposta = { ok: false, mensagem: e instanceof Error ? e.message : 'Erro inesperado ao falar com a Olist.' }
  }
  return NextResponse.json(resposta)
}
