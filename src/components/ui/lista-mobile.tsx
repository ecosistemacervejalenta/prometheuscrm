import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Lista no padrão iOS (linhas com separador, toque com feedback e chevron),
 * usada no lugar das tabelas em telas < 1024px. Some no desktop e na impressão.
 */
export function ListaMobile({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-linha border-t border-linha lg:hidden print:hidden', className)}>{children}</ul>
}

/** Linha padrão: elemento à esquerda, título/subtítulo, valor à direita e chevron (se tiver link). */
export function ItemMobile({
  href,
  inicio,
  titulo,
  subtitulo,
  fim,
  extra,
  className,
}: {
  href?: string
  inicio?: ReactNode
  titulo: ReactNode
  subtitulo?: ReactNode
  fim?: ReactNode
  extra?: ReactNode
  className?: string
}) {
  const conteudo = (
    <>
      {inicio && <div className="shrink-0">{inicio}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-5 font-semibold">{titulo}</div>
        {subtitulo && <div className="mt-0.5 truncate text-[13px] leading-[18px] text-suave">{subtitulo}</div>}
        {extra && <div className="mt-2">{extra}</div>}
      </div>
      {fim && <div className="shrink-0 text-right">{fim}</div>}
      {href && <ChevronRight className="-mr-1 size-4 shrink-0 text-sutil" aria-hidden />}
    </>
  )
  const classes = 'flex min-h-[60px] items-center gap-3 px-4 py-3'

  return (
    <li className={className}>
      {href ? (
        <Link href={href} className={cn(classes, 'transition-colors active:bg-papel')}>
          {conteudo}
        </Link>
      ) : (
        <div className={classes}>{conteudo}</div>
      )}
    </li>
  )
}
