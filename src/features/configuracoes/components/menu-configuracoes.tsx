'use client'

import { LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

import { GRUPOS_CONFIGURACOES, INICIO_CONFIGURACOES } from '../navegacao'

const classesItem = (ativo: boolean) =>
  cn(
    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors',
    ativo ? 'bg-superficie font-semibold text-ink shadow-cartao ring-1 ring-linha' : 'font-medium text-suave hover:bg-ink/5 hover:text-ink',
  )

const classesIcone = (ativo: boolean) => cn('size-4 shrink-0', ativo ? 'text-volt-700' : 'text-sutil')

/** Menu lateral das Configurações (telas largas): grupos fixos, uma seção por assunto. */
export function MenuConfiguracoes() {
  const caminho = usePathname()
  const naVisaoGeral = caminho === INICIO_CONFIGURACOES

  return (
    <nav aria-label="Seções das configurações" className="space-y-5">
      <Link href={INICIO_CONFIGURACOES} aria-current={naVisaoGeral ? 'page' : undefined} className={classesItem(naVisaoGeral)}>
        <LayoutGrid className={classesIcone(naVisaoGeral)} aria-hidden />
        Visão geral
      </Link>

      {GRUPOS_CONFIGURACOES.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="tipo-rotulo mb-1.5 px-2.5 text-sutil">{grupo.titulo}</p>
          <ul className="space-y-0.5">
            {grupo.secoes.map((s) => {
              const ativo = caminho === s.href || caminho.startsWith(`${s.href}/`)
              const Icone = s.icone
              return (
                <li key={s.chave}>
                  <Link href={s.href} aria-current={ativo ? 'page' : undefined} className={classesItem(ativo)}>
                    <Icone className={classesIcone(ativo)} aria-hidden />
                    <span className="truncate">{s.rotulo}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
