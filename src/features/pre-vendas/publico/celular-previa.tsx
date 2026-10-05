'use client'

import { BatteryFull, Signal, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'

/** Largura da tela do iPhone em que o link é desenhado (iPhone 13/14/15). */
const LARGURA_TELA = 390
const ALTURA_TELA = 844
const BORDA = 11

/**
 * Mockup de iPhone com a tela do link de verdade: o conteúdo é montado com 390 px de
 * largura (como no celular) e reduzido com `zoom`, então fica exatamente como o cliente vê.
 * Dá para rolar a tela dentro do mockup.
 */
export function CelularPrevia({ children, largura = 300, className }: { children: ReactNode; largura?: number; className?: string }) {
  const tela = largura - BORDA * 2
  const escala = tela / LARGURA_TELA
  return (
    <div className={className} style={{ width: largura, maxWidth: '100%' }}>
      <div className="relative rounded-[50px] bg-ink p-[11px] shadow-flutuante ring-1 ring-ink-600" style={{ padding: BORDA }}>
        {/* botões laterais */}
        <span className="absolute top-[110px] -left-[3px] h-8 w-[3px] rounded-l bg-ink-700" aria-hidden />
        <span className="absolute top-[160px] -left-[3px] h-12 w-[3px] rounded-l bg-ink-700" aria-hidden />
        <span className="absolute top-[140px] -right-[3px] h-16 w-[3px] rounded-r bg-ink-700" aria-hidden />

        <div className="relative overflow-hidden rounded-[40px] bg-papel" style={{ height: Math.round(tela * (ALTURA_TELA / LARGURA_TELA)) }}>
          {/* barra de status + Dynamic Island */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between bg-papel px-6 text-[12px] font-semibold text-ink">
            <span className="tipo-dado text-[12px]">9:41</span>
            <span className="flex items-center gap-1">
              <Signal className="size-3" aria-hidden />
              <Wifi className="size-3" aria-hidden />
              <BatteryFull className="size-4" aria-hidden />
            </span>
          </div>
          <div className="pointer-events-none absolute top-2 left-1/2 z-30 h-[24px] w-[84px] -translate-x-1/2 rounded-full bg-ink" aria-hidden />

          <div className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="px-5 pt-14 pb-10" style={{ width: LARGURA_TELA, zoom: escala }}>
              {children}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-ink/80" aria-hidden />
        </div>
      </div>
    </div>
  )
}
