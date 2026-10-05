import Link from 'next/link'

import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatarDataCurta, formatarMoeda, formatarRelativo, formatarWhatsapp, numeroPedido } from '@/lib/format'
import type { Configuracoes } from '@/types'

import { linkDeCobranca } from '../cobranca'
import type { PedidoComItens } from '../queries'
import { BotaoCobrar, BotaoPago } from './controles'
import { PagamentoBadge } from './selos'

/**
 * Pedidos com itens + ações de cobrança (WhatsApp) e pagamento.
 * Usada no Grupo VIP e no detalhe da pré-venda. Na impressão vira um romaneio.
 */
export function TabelaCobrancas({ pedidos, config }: { pedidos: PedidoComItens[]; config: Configuracoes }) {
  const linkPara = (p: PedidoComItens) =>
    linkDeCobranca(config, {
      numero: p.numero,
      total: p.total,
      taxa_entrega: p.taxa_entrega,
      cliente: p.clientes,
      pre_venda_titulo: p.pre_vendas?.titulo,
      itens: p.pedido_itens,
    })

  return (
    <>
    {/* Celular: um cartão por pedido, com ações grandes para o polegar */}
    <ul className="divide-y divide-linha border-t border-linha lg:hidden print:hidden">
      {pedidos.map((p) => {
        const emAberto = p.status_pagamento === 'pendente' || p.status_pagamento === 'cobrado'
        return (
          <li key={p.id} className="px-4 py-4">
            <Link href={`/pedidos/${p.id}`} className="flex items-start justify-between gap-3 active:opacity-70">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{p.clientes?.nome}</p>
                <p className="tipo-dado text-[12px] text-suave">
                  {numeroPedido(p.numero)} · {formatarWhatsapp(p.clientes?.whatsapp)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tipo-dado text-[15px] font-semibold">{formatarMoeda(p.total)}</p>
                <div className="mt-1"><PagamentoBadge status={p.status_pagamento} /></div>
              </div>
            </Link>
            <ul className="mt-2.5 space-y-0.5 rounded-xl bg-papel px-3 py-2 text-[13px]">
              {p.pedido_itens.map((i, indice) => (
                <li key={indice} className="truncate">
                  <span className="tipo-dado font-semibold">{i.quantidade}×</span> {i.descricao}
                </li>
              ))}
            </ul>
            {p.cobrancas_enviadas > 0 && (
              <p className="tipo-dado mt-2 text-[11px] text-suave">
                {p.cobrancas_enviadas} cobrança(s) · última {formatarRelativo(p.ultima_cobranca_em)}
              </p>
            )}
            {emAberto && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <BotaoCobrar pedidoId={p.id} href={linkPara(p)} tamanho="md" className="w-full" />
                <BotaoPago pedidoId={p.id} className="h-11 w-full" />
              </div>
            )}
          </li>
        )
      })}
    </ul>

    <Table somenteDesktop>
      <THead>
        <TR>
          <TH>Pedido / cliente</TH>
          <TH>Itens</TH>
          <TH className="text-right">Total</TH>
          <TH>Pagamento</TH>
          <TH className="text-right print:hidden">Cobrança</TH>
          <TH className="hidden w-16 text-center print:table-cell">Separado</TH>
        </TR>
      </THead>
      <TBody>
        {pedidos.map((p) => {
          const emAberto = p.status_pagamento === 'pendente' || p.status_pagamento === 'cobrado'
          const href = linkPara(p)
          return (
            <TR key={p.id} className="evitar-quebra">
              <TD>
                <Link href={`/pedidos/${p.id}`} className="tipo-dado text-[13px] font-semibold hover:text-volt-700">
                  {numeroPedido(p.numero)}
                </Link>
                <p className="font-semibold">{p.clientes?.nome}</p>
                <p className="tipo-dado text-[12px] text-suave">{formatarWhatsapp(p.clientes?.whatsapp)}</p>
              </TD>
              <TD className="text-[13px]">
                <ul>
                  {p.pedido_itens.map((i, indice) => (
                    <li key={indice}>
                      <span className="tipo-dado font-semibold">{i.quantidade}×</span> {i.descricao}
                    </li>
                  ))}
                </ul>
              </TD>
              <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(p.total)}</TD>
              <TD>
                <PagamentoBadge status={p.status_pagamento} />
                {p.cobrancas_enviadas > 0 && (
                  <p className="tipo-dado mt-1 text-[11px] text-suave">
                    {p.cobrancas_enviadas}× · {formatarRelativo(p.ultima_cobranca_em)}
                  </p>
                )}
                {p.status_pagamento === 'pago' && (
                  <p className="tipo-dado mt-1 text-[11px] text-suave">{formatarDataCurta(p.criado_em)}</p>
                )}
              </TD>
              <TD className="print:hidden">
                {emAberto && (
                  <div className="flex justify-end gap-1.5">
                    <BotaoCobrar pedidoId={p.id} href={href} />
                    <BotaoPago pedidoId={p.id} />
                  </div>
                )}
              </TD>
              <TD className="hidden text-center print:table-cell">
                <span className="inline-block size-4 border border-ink" />
              </TD>
            </TR>
          )
        })}
      </TBody>
    </Table>
    </>
  )
}
