import { ChevronLeft, Lock } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { INICIO_CONFIGURACOES, obterSecao, type ChaveSecao } from '../navegacao'

/**
 * Cabeçalho de uma seção das Configurações: onde a pessoa está (grupo › seção),
 * o que se ajusta ali e a situação atual. Toda página de seção começa com ele.
 */
export function CabecalhoSecao({
  secao: chave,
  selo,
  acoes,
  somenteLeitura = false,
}: {
  secao: ChaveSecao
  /** Situação da seção (ex.: <Badge tom="sucesso" ponto>Conectado</Badge>). */
  selo?: ReactNode
  acoes?: ReactNode
  /** Quem está vendo não é administrador e a seção só pode ser alterada por um. */
  somenteLeitura?: boolean
}) {
  const { rotulo, descricao, grupo, icone: Icone } = obterSecao(chave)

  return (
    <header className="mb-5 lg:mb-6">
      <Link
        href={INICIO_CONFIGURACOES}
        className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-volt-700 hover:text-ink xl:hidden print:hidden"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Configurações
      </Link>
      <p className="tipo-rotulo mb-2 hidden text-sutil xl:block">
        Configurações <span aria-hidden>›</span> {grupo}
      </p>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-volt" aria-hidden>
            <Icone className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="tipo-h2 break-words">{rotulo}</h1>
            <p className="mt-0.5 max-w-2xl text-suave">{descricao}</p>
          </div>
        </div>
        {(selo || acoes) && <div className="flex flex-wrap items-center gap-2 print:hidden">{selo}{acoes}</div>}
      </div>

      {somenteLeitura && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-linha bg-superficie px-3.5 py-2.5 text-[13px] text-suave">
          <Lock className="size-4 shrink-0 text-sutil" aria-hidden />
          Você pode consultar esta seção. Só administradores alteram o que está aqui.
        </p>
      )}
    </header>
  )
}
