'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { PERIODOS, type ChavePeriodo } from '../periodos'

/**
 * Controle segmentado de período (Hoje · 7/30/60/90 dias · Este mês · Mês passado).
 * No celular ele rola na horizontal e já abre mostrando o período ativo.
 */
export function SeletorPeriodo({ ativo, comExemplo }: { ativo: ChavePeriodo; comExemplo: boolean }) {
  const trilho = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = trilho.current
    const item = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !item || nav.scrollWidth <= nav.clientWidth) return
    // Centraliza o ativo só dentro do trilho (sem rolar a página).
    nav.scrollLeft = item.offsetLeft - (nav.clientWidth - item.offsetWidth) / 2
  }, [ativo])

  return (
    <nav
      ref={trilho}
      aria-label="Período"
      className="flex max-w-full overflow-x-auto rounded-xl border border-linha bg-papel p-1 [scrollbar-width:none] print:hidden"
    >
      {PERIODOS.map((p) => {
        const selecionado = p.chave === ativo
        return (
          <Link
            key={p.chave}
            href={`/?periodo=${p.chave}${comExemplo ? '&exemplo=1' : ''}`}
            scroll={false}
            aria-current={selecionado ? 'page' : undefined}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-semibold whitespace-nowrap transition-colors lg:flex-none',
              selecionado ? 'bg-superficie text-ink shadow-cartao ring-1 ring-linha' : 'text-suave hover:text-ink',
            )}
          >
            {p.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
