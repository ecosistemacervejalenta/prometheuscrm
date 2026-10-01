import Link from 'next/link'

import { cn } from '@/lib/utils'

/** Abas de navegação (cada aba é uma rota). */
export function TabsLinks({
  abas,
  ativa,
}: {
  abas: Array<{ chave: string; href: string; rotulo: string; contagem?: number }>
  ativa: string
}) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-linha print:hidden" aria-label="Seções">
      {abas.map((aba) => {
        const selecionada = aba.chave === ativa
        return (
          <Link
            key={aba.chave}
            href={aba.href}
            aria-current={selecionada ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 pt-1 pb-3 text-sm font-semibold whitespace-nowrap transition-colors',
              selecionada ? 'border-ink text-ink' : 'border-transparent text-suave hover:text-ink',
            )}
          >
            {aba.rotulo}
            {aba.contagem !== undefined && (
              <span className="tipo-dado rounded-md bg-papel px-1.5 text-[11px] text-suave">{aba.contagem}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
