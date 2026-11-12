'use client'

import { Check, CircleCheck, Copy, LoaderCircle, RefreshCw, Truck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { conferirPagamentoPix, pixDoPedido } from '@/features/mercado-pago/publico'
import type { SituacaoPix } from '@/features/mercado-pago/cobranca'
import { formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

import { classeBotaoGrande, copiarTexto } from './estilos'

/** De quanto em quanto tempo a tela pergunta se o PIX já caiu. */
const INTERVALO_MS = 4_000

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pendente'; pix: Extract<SituacaoPix, { situacao: 'pendente' }> }
  | { tipo: 'pago' }
  | { tipo: 'aguardando_frete' }
  | { tipo: 'expirado' }
  | { tipo: 'reserva' }

/**
 * PIX gerado no Mercado Pago para o valor exato do pedido: código copia e cola + QR Code.
 * Fica conferindo sozinho e troca para "Pagamento confirmado" quando o PIX cai — sem
 * comprovante. Se o Mercado Pago não estiver conectado ou falhar, mostra `reserva`
 * (a chave PIX da loja e o envio do comprovante, como antes).
 */
export function PixMercadoPago({
  pedidoId,
  reserva,
  aoMudar,
}: {
  pedidoId: string
  reserva: ReactNode
  aoMudar?: (situacao: 'pago' | 'aguardando_frete') => void
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const avisado = useRef<string | null>(null)

  const aplicar = useCallback(
    (r: SituacaoPix) => {
      if (r.situacao === 'pendente') setEstado({ tipo: 'pendente', pix: r })
      else if (r.situacao === 'pago') setEstado({ tipo: 'pago' })
      else if (r.situacao === 'aguardando_frete') setEstado({ tipo: 'aguardando_frete' })
      else setEstado({ tipo: 'reserva' })
    },
    [],
  )

  const gerar = useCallback(async () => {
    setEstado({ tipo: 'carregando' })
    try {
      aplicar(await pixDoPedido(pedidoId))
    } catch {
      setEstado({ tipo: 'reserva' })
    }
  }, [pedidoId, aplicar])

  useEffect(() => {
    let ativo = true
    pixDoPedido(pedidoId)
      .then((r) => ativo && aplicar(r))
      .catch(() => ativo && setEstado({ tipo: 'reserva' }))
    return () => {
      ativo = false
    }
  }, [pedidoId, aplicar])

  // Enquanto o PIX está pendente: confere a cada INTERVALO_MS e na hora em que o cliente volta do app do banco.
  const pendente = estado.tipo === 'pendente'
  useEffect(() => {
    if (!pendente) return
    let ativo = true
    let ocupado = false
    async function conferir() {
      if (ocupado || document.visibilityState !== 'visible') return
      ocupado = true
      try {
        const r = await conferirPagamentoPix(pedidoId)
        if (!ativo) return
        if (r === 'pago') setEstado({ tipo: 'pago' })
        else if (r === 'aguardando_frete') setEstado({ tipo: 'aguardando_frete' })
        else if (r === 'expirado') setEstado({ tipo: 'expirado' })
      } catch {
        // sem internet: tenta de novo na próxima volta
      } finally {
        ocupado = false
      }
    }
    const timer = window.setInterval(conferir, INTERVALO_MS)
    document.addEventListener('visibilitychange', conferir)
    return () => {
      ativo = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', conferir)
    }
  }, [pendente, pedidoId])

  useEffect(() => {
    if ((estado.tipo === 'pago' || estado.tipo === 'aguardando_frete') && avisado.current !== estado.tipo) {
      avisado.current = estado.tipo
      aoMudar?.(estado.tipo)
    }
  }, [estado.tipo, aoMudar])

  if (estado.tipo === 'reserva') return <>{reserva}</>

  if (estado.tipo === 'carregando') {
    return (
      <section className="rounded-[24px] border border-linha bg-superficie p-5" aria-busy="true">
        <h2 className="tipo-h2">Pague com PIX</h2>
        <div className="mt-4 grid place-items-center gap-3 rounded-2xl bg-papel px-4 py-12 text-center">
          <LoaderCircle className="size-8 animate-spin text-suave" aria-hidden />
          <p className="text-[15px] text-suave">Gerando seu PIX…</p>
        </div>
      </section>
    )
  }

  if (estado.tipo === 'pago') {
    return (
      <section className="animar-passo rounded-[24px] border-2 border-sucesso/30 bg-sucesso-50 p-6 text-center" role="status">
        <CircleCheck className="mx-auto size-12 text-sucesso" strokeWidth={1.75} aria-hidden />
        <h2 className="tipo-h2 mt-3">Pagamento confirmado!</h2>
        <p className="mt-1.5 text-[16px] text-ink/80">Recebemos o seu PIX. Não precisa mandar comprovante — já está tudo certo por aqui. 🍺</p>
      </section>
    )
  }

  if (estado.tipo === 'aguardando_frete') {
    return (
      <section className="animar-passo rounded-[24px] border-2 border-sucesso/30 bg-sucesso-50 p-6" role="status">
        <p className="flex items-center gap-2 text-[18px] font-semibold text-sucesso">
          <CircleCheck className="size-6" aria-hidden /> PIX das cervejas recebido!
        </p>
        <p className="mt-2 flex gap-2 text-[15px] text-ink/80">
          <Truck className="mt-0.5 size-5 shrink-0 text-suave" aria-hidden />
          Assim que cotarmos o frete, mandamos o valor e um novo link de pagamento no seu WhatsApp.
        </p>
      </section>
    )
  }

  if (estado.tipo === 'expirado') {
    return (
      <section className="rounded-[24px] border border-linha bg-superficie p-5 text-center">
        <h2 className="tipo-h2">Este PIX expirou</h2>
        <p className="mt-1.5 text-[15px] text-suave">Gere um novo código para pagar o seu pedido.</p>
        <button type="button" onClick={gerar} className={classeBotaoGrande('volt', 'mt-4 w-full')}>
          <RefreshCw aria-hidden /> Gerar novo PIX
        </button>
      </section>
    )
  }

  const { pix } = estado
  const parcial = pix.pago > 0
  return (
    <section className="rounded-[24px] border border-linha bg-superficie p-5">
      <h2 className="tipo-h2">Pague com PIX</h2>

      <div className="mt-4 rounded-2xl bg-papel p-4">
        <p className="tipo-rotulo text-suave">{parcial ? 'Falta pagar' : 'Valor a pagar'}</p>
        <p className="tipo-numero mt-1 text-[40px] leading-none">{formatarMoeda(pix.valor)}</p>
        {parcial && <p className="mt-2 text-[14px] text-suave">Você já pagou {formatarMoeda(pix.pago)} deste pedido.</p>}
      </div>

      <BotaoCopiarCodigo codigo={pix.copiaECola} className="mt-4" />

      <ol className="mt-5 space-y-2 text-[15px] text-suave">
        {['Toque em “Copiar código PIX”.', 'No app do seu banco, escolha PIX → Pix Copia e Cola e cole o código.', 'Confirme o pagamento. Esta tela atualiza sozinha.'].map((passo, i) => (
          <li key={passo} className="flex gap-3">
            <span className="tipo-dado grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] text-white">{i + 1}</span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>

      {pix.qrCodeBase64 && (
        <div className="mt-5 border-t border-linha pt-5 text-center">
          <p className="text-[14px] text-suave">Ou leia o QR Code com o app do banco em outro aparelho:</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem em base64 vinda do Mercado Pago */}
          <img
            src={`data:image/png;base64,${pix.qrCodeBase64}`}
            alt={`QR Code do PIX de ${formatarMoeda(pix.valor)}`}
            width={220}
            height={220}
            className="mx-auto mt-3 size-[220px] rounded-xl border border-linha bg-white p-2 [image-rendering:pixelated]"
          />
        </div>
      )}

      <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-papel px-4 py-3 text-[14px] text-suave" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Aguardando o pagamento…
      </p>
      {pix.expiraEm && (
        <p className="mt-2 text-center text-[13px] text-sutil">
          Código válido até {new Date(pix.expiraEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
    </section>
  )
}

function BotaoCopiarCodigo({ codigo, className }: { codigo: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copiarTexto(codigo))) return
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2500)
      }}
      className={classeBotaoGrande('volt', cn('w-full', className))}
    >
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copiado ? 'Código copiado!' : 'Copiar código PIX'}</span>
    </button>
  )
}
