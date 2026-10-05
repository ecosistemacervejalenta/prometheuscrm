'use client'

import { Expand, Maximize, Move, ZoomIn, ZoomOut } from 'lucide-react'
import { useRef, type PointerEvent } from 'react'

import { cn } from '@/lib/utils'

import { estiloDaFoto, limitar, ZOOM_MAXIMO, zoomMinimo, type Enquadramento } from '../foto'

export type FotoEscolhida = { url: string; largura: number; altura: number }

/** A foto como vai ficar: quadrada, com fundo desfocado quando aparece inteira. */
export function FotoEnquadrada({ foto, enquadramento, className }: { foto: FotoEscolhida; enquadramento: Enquadramento; className?: string }) {
  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
      <img src={foto.url} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover blur-2xl" />
      <span className="absolute inset-0 bg-white/20" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
      <img
        src={foto.url}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={estiloDaFoto(enquadramento, foto.largura, foto.altura)}
      />
    </div>
  )
}

/**
 * Enquadramento da foto num quadrado (como aparece no link):
 * arrastar posiciona, o zoom aproxima ou afasta até mostrar a foto inteira.
 */
export function EditorFoto({
  foto,
  enquadramento,
  aoMudar,
}: {
  foto: FotoEscolhida
  enquadramento: Enquadramento
  aoMudar: (e: Enquadramento) => void
}) {
  const arrasto = useRef<{ id: number; x: number; y: number; inicio: Enquadramento } | null>(null)
  const minimo = zoomMinimo(foto.largura, foto.altura)
  const ajustar = (e: Enquadramento) => aoMudar(limitar(e, foto.largura, foto.altura))

  function mover(evento: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    if (!a || a.id !== evento.pointerId) return
    const lado = evento.currentTarget.clientWidth
    ajustar({ ...a.inicio, x: a.inicio.x + (evento.clientX - a.x) / lado, y: a.inicio.y + (evento.clientY - a.y) / lado })
  }

  return (
    <div>
      <div
        className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-papel ring-1 ring-linha select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          arrasto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, inicio: enquadramento }
        }}
        onPointerMove={mover}
        onPointerUp={() => (arrasto.current = null)}
        onPointerCancel={() => (arrasto.current = null)}
        role="img"
        aria-label="Enquadramento da foto. Arraste para posicionar."
      >
        <FotoEnquadrada foto={foto} enquadramento={enquadramento} />
        <span className="pointer-events-none absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1 text-[12px] font-semibold text-white">
          <Move className="size-3.5" aria-hidden /> Arraste para ajustar
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <ZoomOut className="size-4 shrink-0 text-suave" aria-hidden />
        <input
          type="range"
          min={minimo}
          max={ZOOM_MAXIMO}
          step={0.01}
          value={enquadramento.zoom}
          onChange={(e) => ajustar({ ...enquadramento, zoom: Number(e.target.value) })}
          aria-label="Zoom da foto"
          className="h-2 min-w-0 flex-1 cursor-pointer accent-[#0a0e14]"
        />
        <ZoomIn className="size-4 shrink-0 text-suave" aria-hidden />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => ajustar({ zoom: minimo, x: 0, y: 0 })}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-linha bg-superficie text-[13px] font-semibold hover:bg-papel"
        >
          <Expand className="size-3.5" aria-hidden /> Mostrar inteira
        </button>
        <button
          type="button"
          onClick={() => ajustar({ zoom: 1, x: 0, y: 0 })}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-linha bg-superficie text-[13px] font-semibold hover:bg-papel"
        >
          <Maximize className="size-3.5" aria-hidden /> Preencher
        </button>
      </div>
    </div>
  )
}
