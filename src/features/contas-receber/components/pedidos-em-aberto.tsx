import Link from 'next/link'

import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PagamentoBadge } from '@/features/pedidos/components/selos'
import { formatarDataCurta, formatarMoeda, numeroPedido } from '@/lib/format'
import type { StatusPagamento } from '@/types'

type PedidoEmAberto = {
  id: string | null
  numero: number | null
  cliente_nome: string | null
  total: number | null
  status_pagamento: StatusPagamento | null
  criado_em: string | null
}

/** Pedidos do mês ainda não pagos — a outra parte do "a receber" (cobrança fica em Pedidos). */
export function PedidosEmAberto({ pedidos, total }: { pedidos: PedidoEmAberto[]; total: number }) {
  return (
    <Card>
      <CardHeader
        titulo="Pedidos em aberto deste mês"
        descricao={
          pedidos.length === 0
            ? 'Nenhum pedido deste mês aguardando pagamento.'
            : `${pedidos.length} pedido(s) aguardando pagamento · ${formatarMoeda(total)}`
        }
        acoes={
          <ButtonLink href="/pedidos?pagamento=em_aberto" tamanho="sm">
            Todos em aberto
          </ButtonLink>
        }
      />
      {pedidos.length > 0 && (
        <>
          <ListaMobile>
            {pedidos.map((p) => (
              <ItemMobile
                key={p.id}
                href={`/pedidos/${p.id}`}
                titulo={p.cliente_nome ?? 'Cliente'}
                subtitulo={`${numeroPedido(p.numero)} · ${formatarDataCurta(p.criado_em)}`}
                fim={
                  <>
                    <p className="tipo-dado text-[15px]">{formatarMoeda(p.total)}</p>
                    <div className="mt-1">
                      <PagamentoBadge status={p.status_pagamento} />
                    </div>
                  </>
                }
              />
            ))}
          </ListaMobile>
          <Table somenteDesktop>
            <THead>
              <TR>
                <TH>Pedido</TH>
                <TH>Cliente</TH>
                <TH>Data</TH>
                <TH className="text-right">Total</TH>
                <TH>Pagamento</TH>
              </TR>
            </THead>
            <TBody>
              {pedidos.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/pedidos/${p.id}`} className="tipo-dado font-semibold hover:text-volt-700">
                      {numeroPedido(p.numero)}
                    </Link>
                  </TD>
                  <TD>{p.cliente_nome ?? '—'}</TD>
                  <TD className="tipo-dado text-[13px] whitespace-nowrap">{formatarDataCurta(p.criado_em)}</TD>
                  <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(p.total)}</TD>
                  <TD>
                    <PagamentoBadge status={p.status_pagamento} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </Card>
  )
}
