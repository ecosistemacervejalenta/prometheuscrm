import type { ReactNode } from 'react'

import type { Tom } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

const TONS: Record<Tom, string> = {
  volt: 'bg-volt-100 text-volt-700',
  neutro: 'bg-papel text-suave ring-1 ring-inset ring-linha',
  escuro: 'bg-ink text-white escuro:bg-ink-600',
  shopify: 'bg-shopify-50 text-shopify-700',
  app: 'bg-app-50 text-app-700',
  vip: 'bg-vip-50 text-vip-700',
  whatsapp: 'bg-whatsapp-50 text-whatsapp-700',
  sucesso: 'bg-sucesso-50 text-sucesso',
  alerta: 'bg-alerta-50 text-alerta',
  perigo: 'bg-perigo-50 text-perigo',
}

const PONTOS: Record<Tom, string> = {
  volt: 'bg-volt',
  neutro: 'bg-sutil',
  escuro: 'bg-volt',
  shopify: 'bg-shopify',
  app: 'bg-app',
  vip: 'bg-vip',
  whatsapp: 'bg-whatsapp',
  sucesso: 'bg-sucesso',
  alerta: 'bg-alerta',
  perigo: 'bg-perigo',
}

export function Badge({
  tom = 'neutro',
  ponto = false,
  className,
  children,
}: {
  tom?: Tom
  ponto?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        TONS[tom],
        className,
      )}
    >
      {ponto && <span className={cn('size-1.5 rounded-full', PONTOS[tom])} aria-hidden />}
      {children}
    </span>
  )
}

/** Ponto colorido (legenda de gráficos, listas). */
export function Ponto({ tom, className }: { tom: Tom; className?: string }) {
  return <span className={cn('inline-block size-2 rounded-full', PONTOS[tom], className)} aria-hidden />
}
