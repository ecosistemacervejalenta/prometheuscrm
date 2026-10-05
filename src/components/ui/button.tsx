import Link from 'next/link'
import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Botões da marca.
 * Regra do Brand Kit: Volt (variante "primario") = UMA ação principal por tela.
 */
export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'escuro' | 'perigo' | 'whatsapp'
export type TamanhoBotao = 'sm' | 'md' | 'lg' | 'icone'

const VARIANTES: Record<VarianteBotao, string> = {
  primario: 'bg-volt text-ink hover:bg-volt-600 active:bg-volt-700 active:text-white',
  secundario: 'bg-superficie text-ink border border-linha hover:border-linha-forte hover:bg-papel',
  fantasma: 'text-ink hover:bg-ink/5',
  escuro: 'bg-ink text-white hover:bg-ink-700',
  perigo: 'bg-superficie text-perigo border border-perigo/30 hover:bg-perigo-50',
  whatsapp: 'bg-whatsapp text-white hover:bg-whatsapp-700',
}

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg lg:h-8',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl lg:h-10 lg:text-sm',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icone: 'size-10 rounded-lg lg:size-9',
}

export function classesBotao({
  variante = 'secundario',
  tamanho = 'md',
  bloco = false,
  className,
}: {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  bloco?: boolean
  className?: string
} = {}) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center font-semibold whitespace-nowrap transition-colors active:scale-[0.98] lg:active:scale-100',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
    VARIANTES[variante],
    TAMANHOS[tamanho],
    bloco && 'w-full',
    className,
  )
}

type PropsBotao = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  bloco?: boolean
  carregando?: boolean
}

export function Button({
  variante,
  tamanho,
  bloco,
  carregando,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: PropsBotao) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={classesBotao({ variante, tamanho, bloco, className })}
      {...props}
    >
      {carregando && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

type PropsBotaoLink = ComponentProps<typeof Link> & {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  bloco?: boolean
}

export function ButtonLink({ variante, tamanho, bloco, className, ...props }: PropsBotaoLink) {
  return <Link className={classesBotao({ variante, tamanho, bloco, className })} {...props} />
}

type PropsLinkExterno = ComponentProps<'a'> & {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  bloco?: boolean
}

/** Link externo (ex.: WhatsApp) com aparência de botão. */
export function ButtonExternal({ variante, tamanho, bloco, className, ...props }: PropsLinkExterno) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={classesBotao({ variante, tamanho, bloco, className })}
      {...props}
    />
  )
}
