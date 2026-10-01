import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const ESTILOS = {
  info: { classe: 'bg-shopify-50 text-shopify-700 border-shopify/20', Icone: Info },
  sucesso: { classe: 'bg-sucesso-50 text-sucesso border-sucesso/20', Icone: CircleCheck },
  erro: { classe: 'bg-perigo-50 text-perigo border-perigo/20', Icone: CircleAlert },
  alerta: { classe: 'bg-alerta-50 text-alerta border-alerta/20', Icone: CircleAlert },
}

export function Alert({
  tom = 'info',
  titulo,
  children,
  className,
}: {
  tom?: keyof typeof ESTILOS
  titulo?: string
  children?: ReactNode
  className?: string
}) {
  const { classe, Icone } = ESTILOS[tom]
  return (
    <div role={tom === 'erro' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', classe, className)}>
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className={cn(titulo && 'mt-0.5', 'text-ink/80')}>{children}</div>}
      </div>
    </div>
  )
}
