'use client'

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

import { useFormulario } from './action-form'

/** Classes base dos controles de formulário. */
export const classesControle = cn(
  'block w-full rounded-xl border border-linha bg-superficie px-3.5 text-[15px] text-ink placeholder:text-sutil',
  'transition-colors outline-none hover:border-linha-forte focus:border-ink focus:ring-4 focus:ring-volt/25',
  'disabled:cursor-not-allowed disabled:bg-papel disabled:text-suave',
  'aria-[invalid=true]:border-perigo aria-[invalid=true]:focus:ring-perigo/15',
)

function useErro(name?: string) {
  const { estado } = useFormulario()
  return name ? estado.erros?.[name]?.[0] : undefined
}

/** Rótulo + controle + mensagem de erro (lida automaticamente da Server Action). */
export function Field({
  label,
  name,
  dica,
  obrigatorio,
  className,
  children,
}: {
  label: string
  name?: string
  dica?: ReactNode
  obrigatorio?: boolean
  className?: string
  children: ReactNode
}) {
  const erro = useErro(name)
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={name} className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
        {obrigatorio && <span className="ml-0.5 text-perigo" aria-hidden>*</span>}
      </label>
      {children}
      {erro ? (
        <p id={name ? `${name}-erro` : undefined} className="mt-1.5 text-[13px] font-medium text-perigo">
          {erro}
        </p>
      ) : (
        dica && <p className="mt-1.5 text-[13px] text-suave">{dica}</p>
      )}
    </div>
  )
}

export function Input({ className, name, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const erro = useErro(name)
  return (
    <input
      id={name}
      name={name}
      aria-invalid={erro ? true : undefined}
      aria-describedby={erro ? `${name}-erro` : undefined}
      className={cn(classesControle, 'h-11', className)}
      {...props}
    />
  )
}

/** Input de dinheiro com prefixo R$. Aceita "1.234,56". */
export function MoneyInput({ className, name, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const erro = useErro(name)
  return (
    <div className="relative">
      <span className="tipo-dado pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-suave">R$</span>
      <input
        id={name}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        aria-invalid={erro ? true : undefined}
        className={cn(classesControle, 'tipo-dado h-11 pl-10', className)}
        {...props}
      />
    </div>
  )
}

export function Textarea({ className, name, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const erro = useErro(name)
  return (
    <textarea
      id={name}
      name={name}
      rows={rows}
      aria-invalid={erro ? true : undefined}
      className={cn(classesControle, 'py-2.5 leading-6', className)}
      {...props}
    />
  )
}

export function Select({ className, name, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const erro = useErro(name)
  return (
    <select
      id={name}
      name={name}
      aria-invalid={erro ? true : undefined}
      className={cn(classesControle, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  )
}

/** Checkbox com rótulo ao lado. */
export function Checkbox({
  label,
  descricao,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; descricao?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl', className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded-md border-linha-forte accent-[#0a0e14]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {descricao && <span className="block text-[13px] text-suave">{descricao}</span>}
      </span>
    </label>
  )
}

/** Agrupa campos em seções com título (formulários longos). */
export function FormSection({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: ReactNode
}) {
  return (
    <fieldset className="grid gap-x-8 gap-y-4 border-t border-linha py-6 first:border-t-0 first:pt-0 lg:grid-cols-[220px_1fr]">
      <legend className="sr-only">{titulo}</legend>
      <div>
        <p className="tipo-h3 text-[15px]">{titulo}</p>
        {descricao && <p className="mt-1 text-[13px] text-suave">{descricao}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-6">{children}</div>
    </fieldset>
  )
}

/** Barra de ações no rodapé do formulário. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-linha bg-superficie/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6">
      {children}
    </div>
  )
}
