'use client'

import { Ban, MessageSquare, Paperclip } from 'lucide-react'
import Link from 'next/link'
import { useOptimistic, useState, useTransition, type DragEvent } from 'react'

import { useAvisos } from '@/components/ui/toaster'
import { STATUS_TAREFA } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { StatusTarefa } from '@/types'

import { moverTarefa } from '../actions'
import type { TarefaQuadro } from '../queries'
import { STATUS } from '../schema'
import { AvataresTarefa, PONTO_STATUS, PrazoTarefa, SeloPrioridade } from './selos'

const VAZIO: Record<StatusTarefa, string> = {
  a_fazer: 'Nenhuma tarefa esperando.',
  fazendo: 'Arraste para cá o que começou.',
  concluida: 'Arraste para cá o que foi entregue.',
}

const TIPO_ARRASTO = 'application/x-prometheus-tarefa'

/**
 * Quadro A fazer → Fazendo → Concluído.
 * Desktop: arrasta e solta o cartão entre as colunas (muda na hora, salva em seguida).
 * Celular: uma coluna por vez, escolhida nas abas; o status muda dentro do cartão.
 */
export function Quadro({
  tarefas,
  consulta,
  limiteConcluidas,
}: {
  tarefas: TarefaQuadro[]
  /** Filtros atuais da URL (sem o id), para abrir o cartão sem perdê-los. */
  consulta: string
  limiteConcluidas: number
}) {
  const avisar = useAvisos()
  const [, iniciar] = useTransition()
  const [lista, moverNaTela] = useOptimistic(tarefas, (atual, { id, status }: { id: string; status: StatusTarefa }) =>
    atual.map((t) =>
      t.id === id
        ? { ...t, status, impedimento: status === 'concluida' ? null : t.impedimento, concluida_em: status === 'concluida' ? new Date().toISOString() : null }
        : t,
    ),
  )
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<StatusTarefa | null>(null)
  const [aba, setAba] = useState<StatusTarefa>('a_fazer')

  const colunas = STATUS.map((status) => {
    const itens = lista.filter((t) => t.status === status)
    // Recém-concluída (na tela) vai para o topo da coluna.
    if (status === 'concluida') itens.sort((a, b) => (b.concluida_em ?? '').localeCompare(a.concluida_em ?? ''))
    return { status, itens }
  })

  function soltar(status: StatusTarefa, e: DragEvent) {
    e.preventDefault()
    const id = e.dataTransfer.getData(TIPO_ARRASTO) || arrastando
    setArrastando(null)
    setAlvo(null)
    const tarefa = lista.find((t) => t.id === id)
    if (!id || !tarefa || tarefa.status === status) return
    iniciar(async () => {
      moverNaTela({ id, status })
      const r = await moverTarefa(id, status)
      if (r.ok === false) avisar(r.mensagem ?? 'Não foi possível mover a tarefa.', 'erro')
    })
  }

  const href = (id: string) => `/tarefas?${consulta ? `${consulta}&` : ''}id=${id}`

  return (
    <div>
      {/* Abas das colunas (celular) */}
      <div role="tablist" aria-label="Colunas" className="mb-3 flex gap-1 rounded-xl bg-ink/[0.06] p-1 lg:hidden">
        {colunas.map(({ status, itens }) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={aba === status}
            onClick={() => setAba(status)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold',
              aba === status ? 'bg-superficie text-ink shadow-sm' : 'text-suave',
            )}
          >
            {STATUS_TAREFA[status].rotulo}
            <span className="tipo-dado rounded-md bg-papel px-1.5 text-[11px] text-suave">{itens.length}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {colunas.map(({ status, itens }) => (
          <section
            key={status}
            aria-label={STATUS_TAREFA[status].rotulo}
            className={cn('min-w-0', aba !== status && 'max-lg:hidden')}
            onDragOver={(e) => {
              if (!arrastando) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (alvo !== status) setAlvo(status)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null)
            }}
            onDrop={(e) => soltar(status, e)}
          >
            <header className="mb-2 hidden items-center gap-2 px-1 lg:flex">
              <span className={cn('size-2 rounded-full', PONTO_STATUS[status])} aria-hidden />
              <h2 className="text-[14px] font-semibold">{STATUS_TAREFA[status].rotulo}</h2>
              <span className="tipo-dado text-[12px] text-suave">{itens.length}</span>
            </header>
            <div
              className={cn(
                'min-h-40 space-y-2 rounded-cartao p-2 transition-colors lg:min-h-[calc(100dvh-20rem)]',
                alvo === status ? 'bg-volt-50 ring-2 ring-volt ring-inset' : 'bg-ink/[0.035]',
              )}
            >
              {itens.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-sutil">{VAZIO[status]}</p>
              ) : (
                itens.map((t) => (
                  <CartaoTarefa
                    key={t.id}
                    tarefa={t}
                    href={href(t.id)}
                    arrastando={arrastando === t.id}
                    aoArrastar={(e) => {
                      e.dataTransfer.setData(TIPO_ARRASTO, t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setArrastando(t.id)
                    }}
                    aoSoltar={() => {
                      setArrastando(null)
                      setAlvo(null)
                    }}
                  />
                ))
              )}
              {status === 'concluida' && itens.length >= limiteConcluidas && (
                <p className="px-3 py-2 text-center text-[12px] text-sutil">
                  Mostrando as {limiteConcluidas} mais recentes. Use a busca para achar as antigas.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function CartaoTarefa({
  tarefa: t,
  href,
  arrastando,
  aoArrastar,
  aoSoltar,
}: {
  tarefa: TarefaQuadro
  href: string
  arrastando: boolean
  aoArrastar: (e: DragEvent) => void
  aoSoltar: () => void
}) {
  const concluida = t.status === 'concluida'
  return (
    <Link
      href={href}
      scroll={false}
      draggable
      onDragStart={aoArrastar}
      onDragEnd={aoSoltar}
      className={cn(
        'block rounded-xl border bg-superficie p-3 shadow-cartao transition hover:border-linha-forte hover:shadow-md active:scale-[0.99] lg:cursor-grab',
        t.impedimento ? 'border-perigo/40' : 'border-linha',
        arrastando && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-2">
        <SeloPrioridade prioridade={t.prioridade} />
        <span className="tipo-dado text-[12px] text-sutil">#{t.numero}</span>
        <AvataresTarefa pessoas={t.responsaveis} className="ml-auto" />
      </div>
      <p className={cn('mt-2 line-clamp-3 text-[14px] leading-5 font-semibold break-words', concluida && 'text-suave')}>{t.titulo}</p>
      {t.impedimento && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-perigo-50 px-2 py-1.5 text-[12px] leading-4 text-perigo">
          <Ban className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">
            <strong>Impedida:</strong> {t.impedimento}
          </span>
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-3">
        <PrazoTarefa tarefa={t} />
        {(t.anexos > 0 || t.comentarios > 0) && (
          <span className="tipo-dado ml-auto flex shrink-0 items-center gap-2.5 text-[12px] text-sutil">
            {t.anexos > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${t.anexos} imagem(ns)`}>
                <Paperclip className="size-3.5" aria-hidden /> {t.anexos}
              </span>
            )}
            {t.comentarios > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${t.comentarios} comentário(s)`}>
                <MessageSquare className="size-3.5" aria-hidden /> {t.comentarios}
              </span>
            )}
          </span>
        )}
      </div>
    </Link>
  )
}
