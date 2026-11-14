import { NextResponse, type NextRequest } from 'next/server'

import { verificarChave } from '@/features/integracoes/api-auth'
import { buscarNaOlist, prepararProdutoOlist, processarFilaEstoqueOlist, rotinaEstoqueOlist } from '@/features/olist/estoque'
import type { PedidoRotinaEstoque, RespostaRotinaEstoque } from '@/features/olist/rotina-estoque'
import { OlistNaoConectado } from '@/features/olist/token'
import { envServidor } from '@/lib/env.server'

export const maxDuration = 300

/**
 * Estoque da Olist nas pré-vendas (única rota da tela que usa os tokens da Olist).
 *   GET  → Vercel Cron a cada 5 min (vercel.ts): vence caixas sem pagamento, envia a fila de
 *          lançamentos e atualiza o estoque das pré-vendas ativas.
 *   POST → pedidos da tela: { acao: 'buscar', termo } | { acao: 'produto', id } | { acao: 'processar' }.
 */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado
  try {
    return NextResponse.json(await rotinaEstoqueOlist())
  } catch (e) {
    console.error('[olist-estoque] rotina falhou', e)
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : 'erro' }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const negado = verificarChave(request, envServidor.cronSecret, 'CRON_SECRET')
  if (negado) return negado

  const pedido = (await request.json().catch(() => null)) as PedidoRotinaEstoque | null
  let resposta: RespostaRotinaEstoque
  try {
    switch (pedido?.acao) {
      case 'buscar':
        resposta = { ok: true, produtos: await buscarNaOlist(String(pedido.termo ?? '').trim().slice(0, 80)) }
        break
      case 'produto':
        if (!Number.isSafeInteger(pedido.id) || pedido.id <= 0) return NextResponse.json({ ok: false, mensagem: 'Produto inválido.' }, { status: 400 })
        resposta = { ok: true, produto: await prepararProdutoOlist(pedido.id) }
        break
      case 'processar': {
        const fila = await processarFilaEstoqueOlist()
        resposta = { ok: fila.ok, mensagem: fila.motivo ?? `${fila.lancamentos} lançamento(s) enviados à Olist.` }
        break
      }
      default:
        return NextResponse.json({ ok: false, mensagem: 'Pedido inválido.' }, { status: 400 })
    }
  } catch (e) {
    if (!(e instanceof OlistNaoConectado)) console.error('[olist-estoque] pedido falhou', pedido?.acao, e)
    resposta = { ok: false, mensagem: e instanceof Error ? e.message : 'Erro inesperado ao falar com a Olist.' }
  }
  return NextResponse.json(resposta)
}
