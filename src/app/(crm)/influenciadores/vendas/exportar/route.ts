import type { NextRequest } from 'next/server'

import { vendasParaExportar, type FiltrosDeVendas } from '@/features/influenciadores/queries'
import { SITUACAO_VENDA, situacaoDaVenda, type SituacaoVenda } from '@/features/influenciadores/rotulos'
import { hojeISO } from '@/lib/datas'
import { formatarData, formatarHora } from '@/lib/format'

/**
 * Planilha (CSV) das vendas com cupom, com os mesmos filtros da tela.
 * Só a equipe: vendasParaExportar() começa com exigirEquipe() e o RLS confere de novo.
 * Formato do Excel em português: ponto e vírgula, vírgula decimal e BOM (acentos).
 */
export async function GET(request: NextRequest) {
  const busca = request.nextUrl.searchParams
  const dia = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  const situacao = busca.get('situacao') as SituacaoVenda | null
  const influenciador = busca.get('influenciador')
  const filtros: FiltrosDeVendas = {
    influenciadorId: influenciador && /^[0-9a-f-]{36}$/i.test(influenciador) ? influenciador : undefined,
    situacao: situacao && situacao in SITUACAO_VENDA ? situacao : undefined,
    inicio: dia(busca.get('inicio')),
    fim: dia(busca.get('fim')),
    busca: busca.get('q')?.trim() || undefined,
  }

  const vendas = await vendasParaExportar(filtros)

  const dinheiro = (v: number | null) => Number(v ?? 0).toFixed(2).replace('.', ',')
  // Texto entre aspas; célula que começa com =, +, - ou @ ganha um apóstrofo (não vira fórmula no Excel).
  const texto = (v: string | null | undefined) => {
    const limpo = String(v ?? '').replace(/"/g, '""')
    return `"${/^[=+\-@]/.test(limpo) ? `'${limpo}` : limpo}"`
  }

  const linhas = [
    ['Pedido', 'Data', 'Hora', 'Influenciador', 'Cupom', 'Produtos (base)', 'Desconto', 'Frete', 'Total do pedido', '% comissão', 'Comissão', 'Situação', 'Libera em', 'Observação'].join(';'),
    ...vendas.map((v) =>
      [
        texto(v.pedido_numero ?? v.shopify_order_id),
        formatarData(v.pedido_em),
        formatarHora(v.pedido_em),
        texto(v.influenciador_nome),
        texto(v.cupom),
        dinheiro(v.base),
        dinheiro(v.desconto),
        dinheiro(v.frete),
        dinheiro(v.valor_pedido),
        dinheiro(v.percentual),
        dinheiro(v.comissao),
        texto(SITUACAO_VENDA[situacaoDaVenda(v.situacao)].rotulo),
        formatarData(v.liberar_em),
        texto(v.alerta),
      ].join(';'),
    ),
  ]

  return new Response(`﻿${linhas.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendas-influenciadores-${hojeISO()}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
