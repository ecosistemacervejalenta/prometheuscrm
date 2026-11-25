import { ArrowDownRight, Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react'

import { formatarDataHora, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { MovimentoDoLote } from '../queries'

const VISUAL: Record<MovimentoDoLote['tipo'], { icone: LucideIcon; classe: string }> = {
  cadastro: { icone: Plus, classe: 'bg-volt-50 text-volt-700' },
  ajuste: { icone: Pencil, classe: 'bg-papel text-suave ring-1 ring-inset ring-linha' },
  baixa_olist: { icone: ArrowDownRight, classe: 'bg-shopify-50 text-shopify-700' },
  exclusao: { icone: Trash2, classe: 'bg-perigo-50 text-perigo' },
}

const un = (n: number) => `${formatarNumero(n)} un.`

function descricao(m: MovimentoDoLote): string {
  switch (m.tipo) {
    case 'cadastro':
      return `Lote ${m.lote} cadastrado com ${un(m.quantidade)}`
    case 'ajuste':
      return `Lote ${m.lote} ajustado: ${m.quantidade > 0 ? '+' : '−'}${un(Math.abs(m.quantidade))}${m.saldo !== null ? ` (ficou ${un(m.saldo)})` : ''}`
    case 'baixa_olist': {
      const leitura =
        m.estoque_antes !== null && m.estoque_depois !== null
          ? ` — estoque da Olist ${formatarNumero(m.estoque_antes)} → ${formatarNumero(m.estoque_depois)}`
          : m.estoque_depois !== null
            ? ` — estoque da Olist ${formatarNumero(m.estoque_depois)}`
            : ''
      return `Saíram ${un(Math.abs(m.quantidade))} do lote ${m.lote}${m.saldo !== null ? ` (ficou ${un(m.saldo)})` : ''}${leitura}`
    }
    case 'exclusao':
      return `Lote ${m.lote} excluído${m.quantidade ? ` (${un(Math.abs(m.quantidade))} passaram a "sem lote")` : ''}`
  }
}

/** Histórico dos lotes da cerveja: quem cadastrou, ajustou ou excluiu, e as baixas pela Olist. */
export function HistoricoLotes({ movimentos }: { movimentos: MovimentoDoLote[] }) {
  if (movimentos.length === 0) {
    return <p className="border-t border-linha px-4 py-6 text-center text-sm text-suave lg:px-5">Nenhum movimento ainda.</p>
  }
  return (
    <ol className="divide-y divide-linha border-t border-linha">
      {movimentos.map((m) => {
        const { icone: Icone, classe } = VISUAL[m.tipo]
        return (
          <li key={m.id} className="flex items-start gap-3 px-4 py-3 lg:px-5">
            <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', classe)} aria-hidden>
              <Icone className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-5">{descricao(m)}</p>
              <p className="tipo-dado mt-0.5 text-[11px] text-suave">
                {formatarDataHora(m.criado_em)} · {m.tipo === 'baixa_olist' ? 'automático (venda/saída na Olist)' : (m.autor ?? 'equipe')}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
