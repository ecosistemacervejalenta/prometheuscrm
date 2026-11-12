import { CircleCheck, CircleX } from 'lucide-react'

import { formatarMoeda, numeroPedido } from '@/lib/format'

import { PixChaveLoja } from './pagamento'
import { PixMercadoPago } from './pix-mercado-pago'
import type { PedidoParaPagar } from './queries'

/**
 * Página /pagar/{pedido}: o cliente paga o que falta (frete cotado, pedido manual,
 * cobrança da equipe). Mesmo visual do link da pré-venda, pensado para o celular.
 */
export function PaginaPagarPedido({ dados }: { dados: PedidoParaPagar }) {
  const { pedido, loja } = dados
  const primeiroNome = pedido.clienteNome.split(' ')[0]

  let conteudo
  if (pedido.cancelado) {
    conteudo = (
      <section className="rounded-[24px] border border-linha bg-superficie p-6 text-center">
        <CircleX className="mx-auto size-12 text-suave" strokeWidth={1.5} aria-hidden />
        <h2 className="tipo-h2 mt-3">Pedido cancelado</h2>
        <p className="mt-1.5 text-[15px] text-suave">Este pedido foi cancelado e não precisa ser pago. Qualquer dúvida, chame a gente no WhatsApp.</p>
      </section>
    )
  } else if (pedido.pago) {
    conteudo = (
      <section className="rounded-[24px] border-2 border-sucesso/30 bg-sucesso-50 p-6 text-center" role="status">
        <CircleCheck className="mx-auto size-12 text-sucesso" strokeWidth={1.75} aria-hidden />
        <h2 className="tipo-h2 mt-3">Pedido pago</h2>
        <p className="mt-1.5 text-[16px] text-ink/80">Já recebemos o pagamento deste pedido. Obrigado! 🍺</p>
      </section>
    )
  } else {
    const reserva = (
      <PixChaveLoja
        loja={loja}
        valor={pedido.total}
        rotuloValor="Total do pedido"
        detalhe={pedido.taxaEntrega > 0 ? `Inclui o frete de ${formatarMoeda(pedido.taxaEntrega)}. Se já pagou uma parte, pague só o restante.` : undefined}
        mensagemComprovante={`Olá! Segue o comprovante do PIX do pedido ${numeroPedido(pedido.numero)} (${pedido.clienteNome}).`}
      />
    )
    conteudo = loja.mercadoPago ? <PixMercadoPago pedidoId={pedido.id} reserva={reserva} /> : reserva
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="rounded-[28px] bg-ink px-6 py-7 text-white">
        <p className="tipo-rotulo text-white/60">{loja.nome}</p>
        <h1 className="tipo-h1 mt-1">{numeroPedido(pedido.numero)}</h1>
        <p className="mt-2 text-[17px] text-white/80">
          {primeiroNome ? `Olá, ${primeiroNome}! ` : ''}
          {pedido.preVendaTitulo ? `Pedido da pré-venda ${pedido.preVendaTitulo}.` : 'Pagamento do seu pedido.'}
        </p>
      </header>

      {conteudo}

      <section className="rounded-[24px] border border-linha bg-superficie p-5">
        <h2 className="tipo-h3">Seu pedido</h2>
        <ul className="mt-3 space-y-2 text-[15px]">
          {pedido.itens.map((i) => (
            <li key={i.nome} className="flex justify-between gap-3">
              <span>
                <span className="tipo-dado font-semibold">{i.quantidade}×</span> {i.nome}
              </span>
              <span className="tipo-dado shrink-0">{formatarMoeda(i.total)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 text-suave">
            <span>Frete</span>
            <span className="tipo-dado shrink-0">{pedido.frete === 'a_cotar' ? 'a cotar' : formatarMoeda(pedido.taxaEntrega)}</span>
          </li>
          <li className="flex justify-between gap-3 border-t border-linha pt-2 font-semibold">
            <span>Total</span>
            <span className="tipo-dado shrink-0">{formatarMoeda(pedido.total)}</span>
          </li>
        </ul>
      </section>
    </div>
  )
}
