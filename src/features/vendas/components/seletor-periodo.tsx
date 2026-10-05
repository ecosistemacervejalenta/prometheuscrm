import Link from 'next/link'

import { cn } from '@/lib/utils'

import { PERIODOS, type ChavePeriodo } from '../periodos'

/** Controle segmentado de período (Hoje · 7 dias · Este mês · Mês passado). */
export function SeletorPeriodo({ ativo, comExemplo }: { ativo: ChavePeriodo; comExemplo: boolean }) {
  return (
    <nav aria-label="Período" className="flex max-w-full overflow-x-auto rounded-xl border border-linha bg-papel p-1 print:hidden">
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
