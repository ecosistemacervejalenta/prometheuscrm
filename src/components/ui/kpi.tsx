import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Cartão de indicador (KPI) — rótulo mono, número em Archivo.
 * `destaque` usa o fundo Volt (no máximo um por tela).
 */
export function Kpi({
  rotulo,
  valor,
  detalhe,
  tendencia,
  destaque = false,
  className,
}: {
  rotulo: string
  valor: ReactNode
  detalhe?: ReactNode
  tendencia?: 'positiva' | 'negativa' | 'neutra'
  destaque?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-between gap-3 rounded-cartao border p-5',
        destaque ? 'border-volt bg-volt text-ink' : 'border-linha bg-superficie shadow-cartao',
        'print:border print:border-linha print:bg-white print:shadow-none',
        className,
      )}
    >
      <p className={cn('tipo-rotulo', destaque ? 'text-ink/70' : 'text-suave')}>{rotulo}</p>
      <p className="tipo-numero truncate text-[28px] leading-8 sm:text-[32px] sm:leading-9">{valor}</p>
      {detalhe && (
        <p
          className={cn(
            'text-[13px] font-medium',
            destaque && 'text-ink',
            !destaque && tendencia === 'positiva' && 'text-sucesso',
            !destaque && tendencia === 'negativa' && 'text-perigo',
            !destaque && (!tendencia || tendencia === 'neutra') && 'text-suave',
          )}
        >
          {detalhe}
        </p>
      )}
    </div>
  )
}
