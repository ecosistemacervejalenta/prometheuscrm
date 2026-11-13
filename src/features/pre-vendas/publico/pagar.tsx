import { CircleX, Heart, Truck } from 'lucide-react'

import { formatarData, formatarMoeda, numeroPedido } from '@/lib/format'

import { CaixaIlustracao, ConteudoDaCaixa } from './caixa'
import { caixaQuitada, gruposDaCaixa } from './caixa-dados'
import { PixChaveLoja } from './pagamento'
import { PixMercadoPago } from './pix-mercado-pago'
import type { PedidoParaPagar } from './queries'

/**
 * Página /pagar/{pedido}: o cliente fecha e paga a Caixa VIP (ou o que falta de um pedido:
 * frete cotado, cobrança da equipe). Mesmo visual do link da pré-venda, pensado para o celular.
 */
export function PaginaPagarPedido({ dados }: { dados: PedidoParaPagar }) {
  const { caixa, loja } = dados
  const ehCaixa = caixa.situacao !== null
  const cancelado = caixa.status === 'cancelado'
  const quitada = caixaQuitada(caixa)
  const nome = caixa.cliente.primeiroNome

  let conteudo
  if (cancelado) {
    conteudo = (
      <section className="rounded-[24px] border border-linha bg-superficie p-6 text-center">
        <CircleX className="mx-auto size-12 text-suave" strokeWidth={1.5} aria-hidden />
        <h2 className="tipo-h2 mt-3">Pedido cancelado</h2>
        <p className="mt-1.5 text-[15px] text-suave">Este pedido foi cancelado e não precisa ser pago. Qualquer dúvida, chame a gente no WhatsApp.</p>
      </section>
    )
  } else if (!quitada) {
    const reserva = (
      <PixChaveLoja
        loja={loja}
        valor={caixa.devido}
        rotuloValor={caixa.pago > 0 ? 'Falta pagar' : 'Valor a pagar'}
        detalhe={caixa.frete === 'a_cotar' ? 'O frete é pago à parte, quando enviarmos a cotação.' : undefined}
        mensagemComprovante={`Olá! Segue o comprovante do PIX ${ehCaixa ? 'da Caixa VIP' : 'do pedido'} ${numeroPedido(caixa.numero)} — ${formatarMoeda(caixa.devido)}.`}
      />
    )
    conteudo = loja.mercadoPago ? <PixMercadoPago pedidoId={caixa.pedidoId} reserva={reserva} /> : reserva
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="rounded-[28px] bg-ink px-6 pt-6 pb-7 text-center text-white">
        {ehCaixa && (
          <CaixaIlustracao
            estado={quitada || caixa.situacao === 'fechada' ? 'fechada' : 'aberta'}
            quantidade={caixa.unidades}
            movimento={quitada}
            className="mb-3 max-w-[200px]"
          />
        )}
        <p className="tipo-rotulo text-volt">
          {loja.nome} · {ehCaixa ? 'Caixa VIP' : 'Pedido'} {numeroPedido(caixa.numero)}
        </p>
        <h1 className="tipo-h2 mt-1.5 text-balance">
          {quitada
            ? `Tudo pago${nome ? `, ${nome}` : ''}!`
            : ehCaixa
              ? `${nome ? `${nome}, f` : 'F'}eche e pague sua caixa`
              : `${nome ? `Olá, ${nome}! ` : ''}Pagamento do seu pedido`}
        </h1>
        <p className="mt-2 text-[16px] leading-6 text-white/75">
          {quitada
            ? `Sua ${ehCaixa ? 'caixa' : 'encomenda'} vai ser preparada com todo o carinho e sai para entrega assim que as cervejas chegarem${caixa.previsaoEnvio ? ` (previsão ${formatarData(caixa.previsaoEnvio)})` : ''}.`
            : ehCaixa
              ? 'Um PIX só para a caixa inteira, com um frete só. Pagou, a caixa é fechada e enviada com todo o carinho até você.'
              : 'Pague com PIX abaixo. A confirmação é automática.'}
        </p>
      </header>

      {conteudo}

      <ConteudoDaCaixa
        numero={caixa.numero}
        grupos={gruposDaCaixa(caixa.itens)}
        frete={{
          rotulo: ehCaixa ? 'Frete (um só para a caixa)' : 'Frete',
          valor: caixa.frete === 'a_cotar' ? 'a cotar' : formatarMoeda(caixa.taxaEntrega),
        }}
        total={caixa.total}
        rotuloTotal={caixa.frete === 'a_cotar' ? 'Total (sem frete)' : 'Total'}
        pago={caixa.pago}
        devido={caixa.devido}
        previsaoEnvio={caixa.previsaoEnvio}
      />

      {caixa.frete === 'a_cotar' && !cancelado && (
        <p className="flex items-start gap-3 rounded-[20px] border border-alerta/25 bg-alerta-50 p-4 text-[15px] leading-6 text-ink/80">
          <Truck className="mt-0.5 size-5 shrink-0 text-alerta" aria-hidden />
          <span>
            <b className="text-alerta">Frete a cotar.</b> A gente cota um frete só e te manda no WhatsApp.
          </span>
        </p>
      )}

      {ehCaixa && (
        <p className="pb-2 text-center text-[13px] text-balance text-suave">
          <Heart className="mr-1 inline size-3.5 -translate-y-px fill-perigo text-perigo" aria-hidden />
          Sua caixa é fechada e enviada com todo o carinho até você.
        </p>
      )}
    </div>
  )
}
