import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { mesAtual, somarMeses } from '@/lib/datas'
import { formatarMes } from '@/lib/format'

const classeSeta = 'grid size-10 place-items-center rounded-xl border border-linha bg-superficie hover:bg-papel'

/** Navegação mês a mês (‹ Outubro de 2026 ›) usada nas contas a pagar e a receber. */
export function NavegadorMes({ caminho, mes }: { caminho: string; mes: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 lg:mb-6">
      <Link href={`${caminho}?mes=${somarMeses(mes, -1)}`} className={classeSeta} aria-label="Mês anterior">
        <ChevronLeft className="size-4" />
      </Link>
      <p className="tipo-h3 min-w-0 flex-1 text-center lg:min-w-44 lg:flex-none">{formatarMes(mes)}</p>
      <Link href={`${caminho}?mes=${somarMeses(mes, 1)}`} className={classeSeta} aria-label="Próximo mês">
        <ChevronRight className="size-4" />
      </Link>
      {mes !== mesAtual() && (
        <Link
          href={caminho}
          className="w-full text-center text-sm font-semibold text-volt-700 hover:text-ink lg:ml-2 lg:w-auto"
        >
          Voltar para o mês atual
        </Link>
      )}
    </div>
  )
}
