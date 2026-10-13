import { Check, Clock, Flag } from 'lucide-react'

import { iniciais } from '@/lib/format'
import { PRIORIDADE_TAREFA, STATUS_TAREFA } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { PrioridadeTarefa, StatusTarefa } from '@/types'

import { descreverPrazo, nomeCurto, type TomPrazo } from '../prazo'
import { PRIORIDADES, STATUS } from '../schema'

const COR_PRIORIDADE: Record<PrioridadeTarefa, string> = {
  baixa: 'bg-papel text-suave ring-1 ring-inset ring-linha',
  media: 'bg-shopify-50 text-shopify-700',
  alta: 'bg-alerta-50 text-alerta',
  urgente: 'bg-perigo text-white',
}

const PONTO_PRIORIDADE: Record<PrioridadeTarefa, string> = {
  baixa: 'bg-sutil',
  media: 'bg-shopify',
  alta: 'bg-alerta',
  urgente: 'bg-perigo',
}

export const PONTO_STATUS: Record<StatusTarefa, string> = {
  a_fazer: 'bg-sutil',
  fazendo: 'bg-shopify',
  concluida: 'bg-sucesso',
}

export function SeloPrioridade({ prioridade, className }: { prioridade: PrioridadeTarefa; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap',
        COR_PRIORIDADE[prioridade],
        className,
      )}
    >
      <Flag className="size-3" aria-hidden />
      {PRIORIDADE_TAREFA[prioridade].rotulo}
    </span>
  )
}

const COR_PRAZO: Record<TomPrazo, string> = {
  perigo: 'text-perigo font-semibold',
  alerta: 'text-alerta font-semibold',
  neutro: 'text-ink/80',
  sutil: 'text-sutil',
  sucesso: 'text-sucesso',
}

export function PrazoTarefa({
  tarefa,
  className,
}: {
  tarefa: Parameters<typeof descreverPrazo>[0]
  className?: string
}) {
  const { texto, tom } = descreverPrazo(tarefa)
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-[12px]', COR_PRAZO[tom], className)}>
      {tarefa.status === 'concluida' ? <Check className="size-3.5 shrink-0" aria-hidden /> : <Clock className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{texto}</span>
    </span>
  )
}

/** Até 3 bolinhas com as iniciais dos responsáveis (+N). */
export function AvataresTarefa({ pessoas, className }: { pessoas: Array<{ id: string; nome: string }>; className?: string }) {
  const visiveis = pessoas.slice(0, 3)
  const resto = pessoas.length - visiveis.length
  return (
    <span className={cn('flex shrink-0 items-center', className)} title={pessoas.map((p) => p.nome).join(', ')}>
      {visiveis.map((p) => (
        <span
          key={p.id}
          aria-hidden
          className="-ml-1.5 grid size-6 place-items-center rounded-full bg-ink font-mono text-[9px] font-semibold text-white ring-2 ring-superficie first:ml-0"
        >
          {iniciais(p.nome)}
        </span>
      ))}
      {resto > 0 && (
        <span className="-ml-1.5 grid size-6 place-items-center rounded-full bg-papel font-mono text-[9px] font-semibold text-suave ring-2 ring-superficie">
          +{resto}
        </span>
      )}
      <span className="sr-only">Responsáveis: {pessoas.map((p) => p.nome).join(', ')}</span>
    </span>
  )
}

/** Botões lado a lado para escolher um valor (status, prioridade). */
function Segmentado<T extends string>({
  opcoes,
  valor,
  aoEscolher,
  rotulo,
  desabilitado,
  className,
}: {
  opcoes: Array<{ valor: T; rotulo: string; ponto: string }>
  valor: T
  aoEscolher: (valor: T) => void
  rotulo: string
  desabilitado?: boolean
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={cn('flex gap-1 rounded-xl bg-ink/[0.06] p-1', className)}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={desabilitado}
            onClick={() => !ativo && aoEscolher(o.valor)}
            className={cn(
              'inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold whitespace-nowrap transition-colors disabled:opacity-60',
              ativo ? 'bg-superficie text-ink shadow-sm' : 'text-suave hover:text-ink',
            )}
          >
            <span className={cn('size-2 shrink-0 rounded-full', o.ponto)} aria-hidden />
            <span className="truncate">{o.rotulo}</span>
          </button>
        )
      })}
    </div>
  )
}

export function EscolhaStatus(props: {
  valor: StatusTarefa
  aoEscolher: (valor: StatusTarefa) => void
  desabilitado?: boolean
  className?: string
}) {
  return (
    <Segmentado
      rotulo="Status"
      opcoes={STATUS.map((s) => ({ valor: s, rotulo: STATUS_TAREFA[s].rotulo, ponto: PONTO_STATUS[s] }))}
      {...props}
    />
  )
}

export function EscolhaPrioridade(props: {
  valor: PrioridadeTarefa
  aoEscolher: (valor: PrioridadeTarefa) => void
  desabilitado?: boolean
  className?: string
}) {
  return (
    <Segmentado
      rotulo="Prioridade"
      opcoes={PRIORIDADES.map((p) => ({ valor: p, rotulo: PRIORIDADE_TAREFA[p].rotulo, ponto: PONTO_PRIORIDADE[p] }))}
      {...props}
    />
  )
}

/** Membros da equipe como botões liga/desliga (marcar = virar responsável). */
export function SeletorPessoas({
  pessoas,
  selecionados,
  aoAlternar,
  meuId,
  desabilitado,
}: {
  pessoas: Array<{ id: string; nome: string }>
  selecionados: string[]
  aoAlternar: (id: string, marcar: boolean) => void
  meuId: string
  desabilitado?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {pessoas.map((p) => {
        const marcado = selecionados.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={marcado}
            disabled={desabilitado}
            title={p.nome}
            onClick={() => aoAlternar(p.id, !marcado)}
            className={cn(
              'inline-flex h-10 max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[13px] font-semibold transition-colors disabled:opacity-60 lg:h-9',
              marcado ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie text-ink hover:border-linha-forte',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full font-mono text-[10px]',
                marcado ? 'bg-volt text-ink' : 'bg-papel ring-1 ring-linha',
              )}
            >
              {iniciais(p.nome)}
            </span>
            <span className="truncate">
              {nomeCurto(p.nome)}
              {p.id === meuId && <span className={cn('font-normal', marcado ? 'text-white/60' : 'text-suave')}> (você)</span>}
            </span>
            {marcado && <Check className="size-3.5 shrink-0 text-volt" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
