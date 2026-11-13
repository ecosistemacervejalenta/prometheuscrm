'use client'

import { Check, Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'

import { formatarMoeda, formatarWhatsapp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/whatsapp'

import { classeBotaoGrande, copiarTexto } from './estilos'

/** Chave PIX da loja para copiar + envio do comprovante no WhatsApp (sem o Mercado Pago, ou se ele falhar). */
export function PixChaveLoja({
  loja,
  valor,
  rotuloValor,
  detalhe,
  mensagemComprovante,
}: {
  loja: { pix: { chave: string; favorecido: string | null } | null; whatsappComprovante: string | null }
  valor: number
  rotuloValor: string
  detalhe?: string
  mensagemComprovante: string
}) {
  return (
    <>
      <section className="rounded-[24px] border border-linha bg-superficie p-5">
        <h2 className="tipo-h2">Pague com PIX</h2>
        {loja.pix ? (
          <>
            <div className="mt-4 rounded-2xl bg-papel p-4">
              <p className="tipo-rotulo text-suave">{rotuloValor}</p>
              <p className="tipo-numero mt-1 text-[40px] leading-none">{formatarMoeda(valor)}</p>
              {detalhe && <p className="mt-2 text-[14px] text-suave">{detalhe}</p>}
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
    </>
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
