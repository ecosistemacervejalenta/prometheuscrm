import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-volt-50 text-volt-700">
        <Icone className="size-6" aria-hidden />
      </span>
      <p className="tipo-h3">{titulo}</p>
      {descricao && <p className="mt-1 max-w-md text-sm text-suave">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  )
}
