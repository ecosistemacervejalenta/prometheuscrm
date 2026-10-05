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
    <nav
      className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-ink/[0.06] p-1 lg:mb-6 lg:rounded-none lg:border-b lg:border-linha lg:bg-transparent lg:p-0 print:hidden"
      aria-label="Seções"
    >
      {abas.map((aba) => {
        const selecionada = aba.chave === ativa
        return (
          <Link
            key={aba.chave}
            href={aba.href}
            aria-current={selecionada ? 'page' : undefined}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
              'lg:-mb-px lg:flex-none lg:justify-start lg:rounded-none lg:border-b-2 lg:px-3 lg:pt-1 lg:pb-3 lg:text-sm',
              selecionada
                ? 'bg-superficie text-ink shadow-sm lg:border-ink lg:bg-transparent lg:shadow-none'
                : 'text-suave hover:text-ink lg:border-transparent',
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
