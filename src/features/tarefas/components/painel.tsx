'use client'

import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Painel por cima do quadro: folha que sobe de baixo no celular e entra pela
 * direita no desktop. Fecha com Esc ou clicando fora. Não usa <dialog> para que
 * os avisos (toasts) continuem aparecendo por cima dele.
 */
export function Painel({
  rotulo,
  aoFechar,
  children,
  className,
}: {
  rotulo: string
  aoFechar: () => void
  children: ReactNode
  className?: string
}) {
  const painel = useRef<HTMLDivElement>(null)
  const aoFecharRef = useRef(aoFechar)

  useEffect(() => {
    aoFecharRef.current = aoFechar
  })

  useEffect(() => {
    const anterior = document.body.style.overflow
    const focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    // Campo com autoFocus já ganhou o foco: não tira dele.
    if (!painel.current?.contains(document.activeElement)) painel.current?.focus({ preventScroll: true })
    // Esc fecha o painel — a não ser que algo dentro dele (ex.: a foto ampliada) já tenha tratado.
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) aoFecharRef.current()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = anterior
      window.removeEventListener('keydown', aoTeclar)
      focoAnterior?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div className="fixed inset-0 z-40 print:hidden" role="dialog" aria-modal="true" aria-label={rotulo}>
      <button type="button" tabIndex={-1} className="animar-fundo absolute inset-0 bg-ink/40" onClick={aoFechar} aria-label="Fechar" />
      <div
        ref={painel}
        tabIndex={-1}
        className={cn(
          'animar-folha absolute inset-x-0 top-[max(env(safe-area-inset-top),16px)] bottom-0 flex flex-col overflow-hidden rounded-t-[24px] bg-papel shadow-flutuante outline-none',
          'lg:animar-lateral lg:top-0 lg:right-0 lg:bottom-0 lg:left-auto lg:w-[min(720px,100vw)] lg:rounded-none lg:rounded-l-[24px]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
