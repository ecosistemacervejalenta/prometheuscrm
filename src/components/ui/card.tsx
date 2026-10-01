import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        'rounded-cartao border border-linha bg-superficie shadow-cartao print:rounded-none print:border-0 print:shadow-none',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  titulo,
  descricao,
  acoes,
  className,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  acoes?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="tipo-h3 text-[16px] leading-6">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-sm text-suave">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{acoes}</div>}
    </header>
  )
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>
}
