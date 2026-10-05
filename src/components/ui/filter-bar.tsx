'use client'

import { Search } from 'lucide-react'
import Form from 'next/form'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Barra de filtros: os filtros viram parâmetros na URL (compartilháveis e com histórico).
 * Usa o <Form> do Next.js, que navega sem recarregar a página.
 */
export function FilterBar({
  caminho,
  children,
  className,
}: {
  caminho: string
  children: ReactNode
  className?: string
}) {
  return (
    <Form action={caminho} className={cn('flex flex-wrap items-center gap-2 print:hidden', className)}>
      {children}
    </Form>
  )
}

export function SearchField({
  name = 'q',
  valor,
  placeholder = 'Buscar...',
  className,
}: {
  name?: string
  valor?: string
  placeholder?: string
  className?: string
}) {
  return (
    <label className={cn('relative block w-full min-w-[220px] flex-1 lg:w-auto', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sutil" aria-hidden />
      <input
        type="search"
        name={name}
        defaultValue={valor}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-linha bg-superficie pr-3 pl-9 text-sm outline-none placeholder:text-sutil focus:border-ink focus:ring-4 focus:ring-volt/25 lg:h-10"
      />
    </label>
  )
}

export function FilterSelect({
  name,
  valor,
  opcoes,
  rotulo,
  className,
}: {
  name: string
  valor?: string
  opcoes: Array<{ valor: string; rotulo: string }>
  rotulo: string
  className?: string
}) {
  return (
    <label className={cn('block min-w-0 grow basis-[calc(50%-4px)] lg:grow-0 lg:basis-auto', className)}>
      <span className="sr-only">{rotulo}</span>
      <select
        name={name}
        defaultValue={valor ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-11 w-full rounded-xl border border-linha bg-superficie px-3 text-sm font-medium outline-none focus:border-ink lg:h-10 lg:w-auto"
      >
        <option value="">{rotulo}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FilterDate({ name, valor, rotulo }: { name: string; valor?: string; rotulo: string }) {
  return (
    <label className="flex min-w-0 grow basis-[calc(50%-4px)] items-center gap-2 text-sm text-suave lg:grow-0 lg:basis-auto">
      <span className="tipo-rotulo">{rotulo}</span>
      <input
        type="date"
        name={name}
        defaultValue={valor}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-11 min-w-0 flex-1 rounded-xl border border-linha bg-superficie px-3 text-sm text-ink outline-none focus:border-ink lg:h-10 lg:flex-none"
      />
    </label>
  )
}
