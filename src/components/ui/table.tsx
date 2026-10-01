import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Tabela com o visual do mockup: cabeçalho em mono caixa alta e linhas finas. */
export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('-mx-px overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm print:min-w-0">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-linha">{children}</thead>
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-linha">{children}</tbody>
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('align-middle', className)} {...props} />
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn('tipo-rotulo px-3 py-3 font-medium whitespace-nowrap text-suave first:pl-5 last:pr-5', className)}
      {...props}
    />
  )
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-3 first:pl-5 last:pr-5', className)} {...props} />
}
