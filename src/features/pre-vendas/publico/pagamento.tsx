'use client'

import { Check, CircleCheck, Copy, MessageCircle, Truck } from 'lucide-react'
import { useState } from 'react'

import { formatarData, formatarMoeda, formatarWhatsapp, numeroPedido } from '@/lib/format'
import { cn } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/whatsapp'

import type { PedidoFeito } from './armazenamento'
import { classeBotaoGrande, copiarTexto } from './estilos'
import type { PreVendaPublica } from './queries'

/** Última tela do link: pedido confirmado, PIX para copiar e envio do comprovante. */
export function TelaPagamento({
  pedido,
  loja,
  previsaoEntrega,
  aoFazerOutro,
}: {
  pedido: PedidoFeito
  loja: PreVendaPublica['loja']
  previsaoEntrega: string | null
  aoFazerOutro: () => void
}) {
  const aCotar = pedido.frete === 'a_cotar'
  // Frete a cotar: paga agora as cervejas; o frete vai à parte, junto com a cotação.
  const valor = aCotar ? pedido.subtotal : pedido.total
  const primeiroNome = pedido.nome.split(' ')[0]
  const mensagemComprovante = `Olá! Segue o comprovante do PIX do pedido ${numeroPedido(pedido.numero)} (${pedido.nome}) — ${formatarMoeda(valor)}.`

  return (
    <div className="animar-passo space-y-4">
      <section className="rounded-[28px] bg-volt px-6 py-8 text-center">
        <CircleCheck className="mx-auto size-14 text-ink" strokeWidth={1.5} aria-hidden />
        <p className="tipo-rotulo mt-4 text-ink/70">Pedido confirmado</p>
        <h1 className="tipo-h1 mt-1">{numeroPedido(pedido.numero)}</h1>
        <p className="mt-2 text-[17px] text-ink/80">Obrigado, {primeiroNome}! Suas cervejas estão garantidas.</p>
      </section>

      {aCotar && (
        <section className="rounded-[24px] border border-alerta/25 bg-alerta-50 p-5">
          <p className="flex items-center gap-2 text-[17px] font-semibold text-alerta">
            <Truck className="size-5" aria-hidden /> Frete a cotar
          </p>
          <p className="mt-1.5 text-[15px] text-ink/80">
            Seu CEP está fora da nossa área de frete fixo. Vamos cotar o frete e te mandar o valor no WhatsApp o mais rápido possível,
            antes do fechamento do pedido.
          </p>
        </section>
      )}

      <section className="rounded-[24px] border border-linha bg-superficie p-5">
        <h2 className="tipo-h2">Pague com PIX</h2>
        {loja.pix ? (
          <>
            <div className="mt-4 rounded-2xl bg-papel p-4">
              <p className="tipo-rotulo text-suave">{aCotar ? 'Valor das cervejas' : 'Valor a pagar'}</p>
              <p className="tipo-numero mt-1 text-[40px] leading-none">{formatarMoeda(valor)}</p>
              <p className="mt-2 text-[14px] text-suave">
                {aCotar
                  ? 'O frete é pago à parte, quando enviarmos a cotação.'
                  : pedido.taxaEntrega > 0
                    ? `Já inclui o frete fixo de ${formatarMoeda(pedido.taxaEntrega)}.`
                    : 'Sem frete.'}
              </p>
            </div>

            <div className="mt-3 rounded-2xl border-2 border-dashed border-linha-forte p-4">
              <p className="tipo-rotulo text-suave">Chave PIX</p>
              <p className="tipo-dado mt-1 text-[18px] leading-7 break-all select-all">{loja.pix.chave}</p>
              {loja.pix.favorecido && (
                <p className="mt-1 text-[14px] text-suave">
                  Favorecido: <span className="font-semibold text-ink">{loja.pix.favorecido}</span>
                </p>
              )}
            </div>

            <BotaoCopiar texto={loja.pix.chave} rotulo="Copiar chave PIX" className="mt-4" />

            <ol className="mt-5 space-y-2 text-[15px] text-suave">
              {[
                'Abra o app do seu banco e escolha PIX → Pagar com chave.',
                `Cole a chave e digite o valor de ${formatarMoeda(valor)}.`,
                'Envie o comprovante no nosso WhatsApp (botão abaixo).',
              ].map((passo, i) => (
                <li key={passo} className="flex gap-3">
                  <span className="tipo-dado grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] text-white">{i + 1}</span>
                  <span>{passo}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-suave">Vamos te enviar os dados de pagamento pelo WhatsApp em instantes.</p>
        )}
      </section>

      {loja.whatsappComprovante && (
        <section className="rounded-[24px] border border-linha bg-superficie p-5">
          <h2 className="tipo-h3">Envie o comprovante</h2>
          <p className="mt-1 text-[15px] text-suave">
            Depois de pagar, mande o comprovante direto para o nosso WhatsApp{' '}
            <span className="font-semibold whitespace-nowrap text-ink">{formatarWhatsapp(loja.whatsappComprovante)}</span>.
          </p>
          <a
            href={linkWhatsapp(loja.whatsappComprovante, mensagemComprovante)}
            target="_blank"
            rel="noopener noreferrer"
            className={classeBotaoGrande('whatsapp', 'mt-4 w-full')}
          >
            <MessageCircle aria-hidden /> Enviar comprovante
          </a>
        </section>
      )}

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
            <span className="tipo-dado shrink-0">{aCotar ? 'a cotar' : formatarMoeda(pedido.taxaEntrega)}</span>
          </li>
          <li className="flex justify-between gap-3 border-t border-linha pt-2 font-semibold">
            <span>Total{aCotar ? ' (sem frete)' : ''}</span>
            <span className="tipo-dado shrink-0">{formatarMoeda(valor)}</span>
          </li>
        </ul>
        {previsaoEntrega && <p className="mt-3 text-[14px] text-suave">Previsão de entrega: {formatarData(previsaoEntrega)}.</p>}
      </section>

      <button type="button" onClick={aoFazerOutro} className="mx-auto block py-3 text-[15px] font-semibold text-suave hover:text-ink">
        Fazer outro pedido
      </button>
    </div>
  )
}

function BotaoCopiar({ texto, rotulo, className }: { texto: string; rotulo: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copiarTexto(texto))) return
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2500)
      }}
      className={classeBotaoGrande('volt', cn('w-full', className))}
    >
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copiado ? 'Chave copiada!' : rotulo}</span>
    </button>
  )
}
