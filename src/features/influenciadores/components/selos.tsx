import { TicketPercent } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { TabsLinks } from '@/components/ui/tabs'
import { PERIODOS, type ChavePeriodo } from '@/features/vendas/periodos'
import { cn } from '@/lib/utils'
import type { StatusInfluenciador } from '@/types'

import { CUPOM_SITUACAO, SITUACAO_VENDA, situacaoDaVenda, STATUS_INFLUENCIADOR } from '../rotulos'

/** Peças pequenas do programa de influenciadores, usadas no CRM e no Portal. */

export function SeloStatusInfluenciador({ status }: { status: StatusInfluenciador | null }) {
  const s = STATUS_INFLUENCIADOR[status ?? 'ativo']
  return <Badge tom={s.tom} ponto>{s.rotulo}</Badge>
}

export function SeloSituacaoVenda({ situacao }: { situacao: string | null }) {
  const s = SITUACAO_VENDA[situacaoDaVenda(situacao)]
  return <Badge tom={s.tom}>{s.rotulo}</Badge>
}

export function SeloCupomNaShopify({ situacao }: { situacao: string | null }) {
  const s = CUPOM_SITUACAO[situacao ?? 'pendente'] ?? CUPOM_SITUACAO.pendente
  return <Badge tom={s.tom} ponto>{s.rotulo}</Badge>
}

/** O código do cupom, sempre em mono e com o ícone — é a "identidade" do influenciador nas listas. */
export function Cupom({ codigo, apagado = false, className }: { codigo: string | null; apagado?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'tipo-dado inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold tracking-wide',
        apagado ? 'bg-papel text-suave line-through decoration-sutil' : 'bg-ink text-white',
        className,
      )}
    >
      <TicketPercent className="size-3.5 text-volt" aria-hidden />
      {codigo ?? '—'}
    </span>
  )
}

const ABAS = [
  { chave: 'visao', href: '/influenciadores', rotulo: 'Visão geral' },
  { chave: 'lista', href: '/influenciadores/lista', rotulo: 'Influenciadores' },
  { chave: 'vendas', href: '/influenciadores/vendas', rotulo: 'Vendas' },
  { chave: 'pagamentos', href: '/influenciadores/pagamentos', rotulo: 'Repasses' },
  { chave: 'ajustes', href: '/influenciadores/ajustes', rotulo: 'Ajustes' },
] as const

export type AbaInfluenciadores = (typeof ABAS)[number]['chave']

export function AbasInfluenciadores({ ativa, aPagar }: { ativa: AbaInfluenciadores; aPagar?: number }) {
  return <TabsLinks ativa={ativa} abas={ABAS.map((a) => (a.chave === 'pagamentos' && aPagar ? { ...a, contagem: aPagar } : { ...a }))} />
}

/** Controle segmentado de período; o período vai na URL (`?periodo=`), junto dos outros filtros. */
export function SeletorDePeriodo({
  ativo,
  caminho,
  parametros = {},
  opcoes = ['7d', '30d', '90d', 'mes', 'mes_anterior'],
}: {
  ativo: ChavePeriodo
  caminho: string
  parametros?: Record<string, string | undefined>
  opcoes?: ChavePeriodo[]
}) {
  const href = (chave: ChavePeriodo) => {
    const busca = new URLSearchParams()
    Object.entries(parametros).forEach(([k, v]) => v && busca.set(k, v))
    busca.set('periodo', chave)
    return `${caminho}?${busca.toString()}`
  }
  return (
    <nav aria-label="Período" className="flex max-w-full overflow-x-auto rounded-xl border border-linha bg-papel p-1 [scrollbar-width:none] print:hidden">
      {PERIODOS.filter((p) => opcoes.includes(p.chave)).map((p) => {
        const selecionado = p.chave === ativo
        return (
          <Link
            key={p.chave}
            href={href(p.chave)}
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
