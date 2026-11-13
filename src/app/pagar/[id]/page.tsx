import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PaginaPagarPedido } from '@/features/pre-vendas/publico/pagar'
import { obterPedidoParaPagar } from '@/features/pre-vendas/publico/queries'
import { numeroPedido } from '@/lib/format'

export async function generateMetadata({ params }: PageProps<'/pagar/[id]'>): Promise<Metadata> {
  const dados = await obterPedidoParaPagar((await params).id)
  return {
    title: { absolute: dados ? `${dados.caixa.situacao ? 'Caixa VIP' : 'Pedido'} ${numeroPedido(dados.caixa.numero)} · ${dados.loja.nome}` : 'Pagamento' },
    robots: { index: false, follow: false },
  }
}

/** Link público de pagamento de um pedido (PIX pelo Mercado Pago ou chave da loja). */
export default async function PaginaPagar({ params }: PageProps<'/pagar/[id]'>) {
  const dados = await obterPedidoParaPagar((await params).id)
  if (!dados) notFound()
  return (
    <div className="min-h-dvh bg-papel">
      <PaginaPagarPedido dados={dados} />
    </div>
  )
}
