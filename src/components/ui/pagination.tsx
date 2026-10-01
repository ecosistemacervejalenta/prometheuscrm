import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Paginação por links preservando os filtros atuais da URL. */
export function Pagination({
  pagina,
  porPagina,
  total,
  caminho,
  parametros,
}: {
  pagina: number
  porPagina: number
  total: number
  caminho: string
  parametros: Record<string, string | undefined>
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  if (totalPaginas <= 1) return null

  const href = (p: number) => {
    const busca = new URLSearchParams()
    Object.entries(parametros).forEach(([chave, valor]) => valor && chave !== 'pagina' && busca.set(chave, valor))
    if (p > 1) busca.set('pagina', String(p))
    const texto = busca.toString()
    return texto ? `${caminho}?${texto}` : caminho
  }

  const classeLink = 'inline-flex h-8 items-center gap-1 rounded-lg border border-linha bg-superficie px-3 text-[13px] font-semibold'
  const inicio = (pagina - 1) * porPagina + 1
  const fim = Math.min(pagina * porPagina, total)

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-linha px-5 py-3 print:hidden" aria-label="Paginação">
      <p className="tipo-dado text-[12px] text-suave">
        {formatarNumero(inicio)}–{formatarNumero(fim)} de {formatarNumero(total)}
      </p>
      <div className="flex gap-2">
        <Link
          href={href(pagina - 1)}
          aria-disabled={pagina <= 1}
          className={cn(classeLink, pagina <= 1 && 'pointer-events-none opacity-40')}
        >
          <ChevronLeft className="size-4" aria-hidden /> Anterior
        </Link>
        <Link
          href={href(pagina + 1)}
          aria-disabled={pagina >= totalPaginas}
          className={cn(classeLink, pagina >= totalPaginas && 'pointer-events-none opacity-40')}
        >
          Próxima <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </nav>
  )
}
