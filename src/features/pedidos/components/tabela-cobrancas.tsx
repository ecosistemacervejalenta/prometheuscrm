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
  return (
    <Table>
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
          const href = linkDeCobranca(config, {
            numero: p.numero,
            total: p.total,
            taxa_entrega: p.taxa_entrega,
            cliente: p.clientes,
            pre_venda_titulo: p.pre_vendas?.titulo,
            itens: p.pedido_itens,
          })
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
  )
}
