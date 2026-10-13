'use client'

import { Bell, CheckCheck, ListTodo } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { formatarHaQuanto } from '@/lib/format'
import { cn } from '@/lib/utils'

import { marcarAvisosLidos } from '../actions'
import type { Aviso } from '../queries'

export type PropsAvisos = { itens: Aviso[]; naoLidos: number }

/**
 * Sino de avisos: "Fulano marcou você na tarefa #12", comentários, impedimentos…
 * menu  → barra lateral escura (desktop), abre um painel ao lado do menu.
 * topo  → barra superior do celular, abre uma folha que sobe de baixo.
 */
export function SinoAvisos({ itens, naoLidos, variante }: PropsAvisos & { variante: 'menu' | 'topo' }) {
  const [aberto, setAberto] = useState(false)
  const [marcando, iniciar] = useTransition()

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  const menu = variante === 'menu'
  const rotulo = naoLidos ? `Avisos (${naoLidos} novos)` : 'Avisos'

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={rotulo}
        title={rotulo}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className={cn(
          'relative grid size-9 shrink-0 place-items-center rounded-full transition-colors',
          menu ? 'text-white/60 hover:bg-ink-700 hover:text-white' : 'text-ink active:opacity-60',
          aberto && menu && 'bg-ink-700 text-white',
        )}
      >
        <Bell className="size-[19px]" strokeWidth={naoLidos ? 2.2 : 1.8} aria-hidden />
        {naoLidos > 0 && (
          <span
            className={cn(
              'tipo-dado absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-volt px-1 text-[10px] leading-none text-ink ring-2',
              menu ? 'ring-ink' : 'ring-papel',
            )}
          >
            {naoLidos > 99 ? '99+' : naoLidos}
          </span>
        )}
      </button>

      {aberto && (
        <div className={cn('fixed inset-0 z-50', menu ? 'hidden lg:block' : 'lg:hidden')} role="dialog" aria-modal="true" aria-label="Avisos">
          <button
            type="button"
            tabIndex={-1}
            className={cn('absolute inset-0', menu ? 'cursor-default' : 'animar-fundo bg-ink/40')}
            onClick={() => setAberto(false)}
            aria-label="Fechar avisos"
          />
          <div
            className={cn(
              'absolute flex flex-col overflow-hidden bg-superficie text-ink shadow-flutuante',
              menu
                ? 'animar-fundo top-4 left-[16.5rem] max-h-[calc(100dvh-2rem)] w-[400px] rounded-cartao border border-linha'
                : 'animar-folha inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[28px] pb-[env(safe-area-inset-bottom)]',
            )}
          >
            {!menu && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-linha-forte" aria-hidden />}
            <header className="flex items-center justify-between gap-3 border-b border-linha px-4 py-3">
              <p className="tipo-h3 text-[16px]">Avisos</p>
              {naoLidos > 0 && (
                <button
                  type="button"
                  disabled={marcando}
                  onClick={() => iniciar(async () => void (await marcarAvisosLidos()))}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-volt-700 hover:bg-volt-50 disabled:opacity-50"
                >
                  <CheckCheck className="size-4" aria-hidden /> Marcar todos como lidos
                </button>
              )}
            </header>

            {itens.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-volt-50 text-volt-700">
                  <Bell className="size-5" aria-hidden />
                </span>
                <p className="font-semibold">Nenhum aviso por aqui</p>
                <p className="mt-1 text-[13px] text-suave">Quando marcarem você numa tarefa, o aviso aparece aqui.</p>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {itens.map((a) => {
                  const conteudo = (
                    <>
                      <Avatar nome={a.autor_nome} tamanho="sm" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[14px] leading-5', a.lido ? 'font-medium' : 'font-semibold')}>{a.titulo}</span>
                        {a.tarefa && <span className="mt-0.5 block truncate text-[13px] text-ink/80">{a.tarefa.titulo}</span>}
                        {a.texto && <span className="mt-0.5 line-clamp-2 block text-[13px] text-suave">“{a.texto}”</span>}
                        <span className="tipo-dado mt-1 block text-[11px] text-sutil">{formatarHaQuanto(a.criado_em)}</span>
                      </span>
                      {!a.lido && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-volt" aria-label="Não lido" />}
                    </>
                  )
                  const classes = cn(
                    'flex gap-3 border-b border-linha px-4 py-3 last:border-b-0',
                    !a.lido && 'bg-volt-50/50',
                    a.tarefa && 'hover:bg-papel active:bg-papel',
                  )
                  return (
                    <li key={a.id}>
                      {a.tarefa ? (
                        <Link href={`/tarefas?id=${a.tarefa.id}`} scroll={false} onClick={() => setAberto(false)} className={classes}>
                          {conteudo}
                        </Link>
                      ) : (
                        <div className={classes}>{conteudo}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <footer className="border-t border-linha px-4 py-2.5">
              <Link
                href="/tarefas?resp=eu"
                onClick={() => setAberto(false)}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-volt-700 hover:text-ink"
              >
                <ListTodo className="size-4" aria-hidden /> Ver minhas tarefas
              </Link>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
