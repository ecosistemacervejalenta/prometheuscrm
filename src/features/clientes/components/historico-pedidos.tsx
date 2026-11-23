import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { CaixaBadge, CanalBadge, PagamentoBadge, StatusPedidoBadge } from '@/features/pedidos/components/selos'
import { formatarData, formatarMoeda, numeroPedido } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { PedidoDoHistorico } from '../queries'

/**
 * Todos os pedidos do cliente, do mais novo ao mais antigo: o que ele comprou em cada um
 * (cerveja, quantidade, valor e de qual pré-venda veio), o frete e quanto já pagou.
 */
export function HistoricoDePedidos({ pedidos, clienteId }: { pedidos: PedidoDoHistorico[]; clienteId: string }) {
  if (pedidos.length === 0) {
    return (
      <EmptyState
        icone={ShoppingBag}
        titulo="Nenhum pedido ainda"
        acao={<ButtonLink href={`/pedidos/novo?cliente=${clienteId}`}>Lançar pedido</ButtonLink>}
      />
    )
  }

  return (
    <ol className="divide-y divide-linha border-t border-linha">
      {pedidos.map((p) => {
        const cancelado = p.status === 'cancelado'
        // Pedido de uma pré-venda só: o nome vai no cabeçalho. Caixa VIP com várias: em cada cerveja.
        const variasPreVendas = p.preVendas.length > 1
        return (
          <li key={p.id} className={cn('px-4 py-4 lg:px-5', cancelado && 'opacity-60')}>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
              <div className="min-w-0">
                <Link href={`/pedidos/${p.id}`} className="tipo-dado font-semibold hover:text-volt-700">
                  {numeroPedido(p.numero)}
                </Link>
                <span className="tipo-dado ml-2 text-[13px] text-suave">{formatarData(p.criadoEm)}</span>
                {!variasPreVendas && p.preVendas[0] && <p className="truncate text-[13px] text-suave">{p.preVendas[0]}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <CanalBadge canal={p.canal} />
                <CaixaBadge caixa={p.caixa} />
                {cancelado ? <StatusPedidoBadge status={p.status} /> : <PagamentoBadge status={p.statusPagamento} />}
              </div>
            </div>

            <ul className="mt-3 space-y-1.5 text-[14px]">
              {p.itens.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="tipo-dado text-suave">{i.quantidade}×</span> {i.descricao}
                    {variasPreVendas && i.preVenda && <span className="block text-[12px] text-suave">{i.preVenda}</span>}
                  </span>
                  <span className="tipo-dado shrink-0 text-[13px]">{formatarMoeda(i.total)}</span>
                </li>
              ))}
              {(p.taxaEntrega > 0 || p.frete === 'a_cotar') && (
                <li className="flex justify-between gap-3 text-suave">
                  <span>Frete</span>
                  <span className="tipo-dado shrink-0 text-[13px]">{p.frete === 'a_cotar' ? 'a cotar' : formatarMoeda(p.taxaEntrega)}</span>
                </li>
              )}
              {p.desconto > 0 && (
                <li className="flex justify-between gap-3 text-suave">
                  <span>Desconto</span>
                  <span className="tipo-dado shrink-0 text-[13px]">−{formatarMoeda(p.desconto)}</span>
                </li>
              )}
            </ul>

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-papel px-3 py-2 text-[13px]">
              <div className="flex gap-1.5">
                <dt className="text-suave">Total</dt>
                <dd className="tipo-dado font-semibold">{formatarMoeda(p.total)}</dd>
              </div>
              {!cancelado && (
                <>
                  <div className="flex gap-1.5">
                    <dt className="text-suave">Pago</dt>
                    <dd className={cn('tipo-dado font-semibold', p.pago > 0 && 'text-sucesso')}>{formatarMoeda(p.pago)}</dd>
                  </div>
                  {p.falta > 0 && (
                    <div className="flex gap-1.5">
                      <dt className="text-suave">Falta</dt>
                      <dd className="tipo-dado font-semibold text-alerta">{formatarMoeda(p.falta)}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </li>
        )
      })}
    </ol>
  )
}
