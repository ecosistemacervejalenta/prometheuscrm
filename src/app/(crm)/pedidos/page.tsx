import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, ShoppingBag } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, FilterSelect, SearchField } from '@/components/ui/filter-bar'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { CanalBadge, PagamentoBadge, StatusPedidoBadge } from '@/features/pedidos/components/selos'
import { listarPedidos, PEDIDOS_POR_PAGINA, type FiltroPagamento } from '@/features/pedidos/queries'
import { formatarDataCurta, formatarHora, formatarMoeda, formatarNumero, numeroPedido } from '@/lib/format'
import { CANAIS, STATUS_PEDIDO } from '@/lib/rotulos'
import { param } from '@/lib/utils'
import type { CanalVenda, StatusPedido } from '@/types'

export const metadata: Metadata = { title: 'Pedidos' }

export default async function PaginaPedidos({ searchParams }: PageProps<'/pedidos'>) {
  const busca = await searchParams
  const q = param(busca.q)
  const canal = param(busca.canal) as CanalVenda | undefined
  const pagamento = param(busca.pagamento) as FiltroPagamento | undefined
  const status = param(busca.status) as StatusPedido | undefined
  const pagina = Math.max(1, Number(param(busca.pagina) ?? 1) || 1)

  const { pedidos, total } = await listarPedidos({
    busca: q,
    canal: canal && canal in CANAIS ? canal : undefined,
    pagamento: pagamento && ['em_aberto', 'pendente', 'cobrado', 'pago', 'estornado'].includes(pagamento) ? pagamento : undefined,
    status: status && status in STATUS_PEDIDO ? status : undefined,
    pagina,
  })

  return (
    <>
      <PageHeader
        titulo="Pedidos"
        contexto={`${formatarNumero(total)} pedido(s)`}
        acoes={
          <ButtonLink href="/pedidos/novo" variante="primario">
            <Plus /> Novo pedido
          </ButtonLink>
        }
      />
      <Card>
        <div className="border-b border-linha p-4">
          <FilterBar caminho="/pedidos">
            <SearchField valor={q} placeholder="Nº do pedido ou nome do cliente" />
            <FilterSelect
              name="canal"
              valor={canal}
              rotulo="Todos os canais"
              opcoes={Object.entries(CANAIS).map(([valor, { rotulo }]) => ({ valor, rotulo }))}
            />
            <FilterSelect
              name="pagamento"
              valor={pagamento}
              rotulo="Qualquer pagamento"
              opcoes={[
                { valor: 'em_aberto', rotulo: 'Em aberto (a receber)' },
                { valor: 'pendente', rotulo: 'Pendente' },
                { valor: 'cobrado', rotulo: 'Cobrado' },
                { valor: 'pago', rotulo: 'Pago' },
                { valor: 'estornado', rotulo: 'Estornado' },
              ]}
            />
            <FilterSelect
              name="status"
              valor={status}
              rotulo="Qualquer status"
              opcoes={Object.entries(STATUS_PEDIDO).map(([valor, { rotulo }]) => ({ valor, rotulo }))}
            />
          </FilterBar>
        </div>

        {pedidos.length === 0 ? (
          <EmptyState
            icone={ShoppingBag}
            titulo="Nenhum pedido encontrado"
            descricao="Pedidos chegam pelos links de pré-venda, pela Shopify ou são lançados manualmente."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Pedido</TH>
                  <TH>Cliente</TH>
                  <TH>Canal</TH>
                  <TH className="text-right">Unid.</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Pagamento</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {pedidos.map((p) => (
                  <TR key={p.id} className="hover:bg-papel/60">
                    <TD>
                      <Link href={`/pedidos/${p.id}`} className="tipo-dado font-semibold hover:text-volt-700">
                        {numeroPedido(p.numero)}
                      </Link>
                      <p className="tipo-dado text-[11px] text-suave">
                        {formatarDataCurta(p.criado_em)} · {formatarHora(p.criado_em)}
                      </p>
                    </TD>
                    <TD>
                      <Link href={`/clientes/${p.cliente_id}`} className="font-medium hover:text-volt-700">
                        {p.cliente_nome}
                      </Link>
                      {p.pre_venda_titulo && <p className="text-[12px] text-suave">{p.pre_venda_titulo}</p>}
                    </TD>
                    <TD><CanalBadge canal={p.canal} /></TD>
                    <TD className="tipo-dado text-right">{p.unidades}</TD>
                    <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(p.total)}</TD>
                    <TD><PagamentoBadge status={p.status_pagamento} /></TD>
                    <TD><StatusPedidoBadge status={p.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              pagina={pagina}
              porPagina={PEDIDOS_POR_PAGINA}
              total={total}
              caminho="/pedidos"
              parametros={{ q, canal, pagamento, status }}
            />
          </>
        )}
      </Card>
    </>
  )
}
