import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

/** Cabeçalho de página: linha de contexto em mono + título em Archivo + ações. */
export function PageHeader({
  titulo,
  contexto,
  descricao,
  acoes,
  voltar,
}: {
  titulo: ReactNode
  contexto?: ReactNode
  descricao?: ReactNode
  acoes?: ReactNode
  voltar?: { href: string; rotulo: string }
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {voltar && (
          <Link
            href={voltar.href}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-volt-700 hover:text-ink print:hidden"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {voltar.rotulo}
          </Link>
        )}
        {contexto && <p className="tipo-dado text-[13px] text-suave">{contexto}</p>}
        <h1 className="tipo-h2 sm:tipo-h1 mt-0.5 break-words">{titulo}</h1>
        {descricao && <div className="mt-1 max-w-2xl text-suave">{descricao}</div>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 print:hidden">{acoes}</div>}
    </header>
  )
}
