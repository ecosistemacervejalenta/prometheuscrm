import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

import { CopyButton } from '@/components/ui/copy-button'
import { cn } from '@/lib/utils'

/**
 * Peças comuns das páginas de Configurações. Cada página é uma pilha de cartões com
 * um assunto só: situação, ajustes, passo a passo e — sempre por último — a zona de risco.
 */

/** Pilha de cartões de uma seção. `estreita` para páginas de formulário (leitura mais confortável). */
export function Pilha({ estreita = false, className, children }: { estreita?: boolean; className?: string; children: ReactNode }) {
  return <div className={cn('space-y-5 lg:space-y-6', estreita && 'max-w-3xl', className)}>{children}</div>
}

/** Quadro de dados da situação atual (conta, datas, contagens). */
export function Dados({ colunas = 3, children }: { colunas?: 2 | 3 | 4 | 5; children: ReactNode }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-papel p-4 text-[14px]',
        colunas === 3 && 'sm:grid-cols-3',
        colunas === 4 && 'sm:grid-cols-4',
        colunas === 5 && 'sm:grid-cols-3 xl:grid-cols-5',
      )}
    >
      {children}
    </dl>
  )
}

/** `largo`: no celular (2 colunas) ocupa a linha inteira — para textos compridos. */
export function Dado({ rotulo, children, largo = false }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <div className={cn('min-w-0', largo && 'max-sm:col-span-2')}>
      <dt className="tipo-rotulo text-suave">{rotulo}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  )
}

/** Endereço ou valor para copiar e colar em outro sistema. */
export function UrlCopiavel({ rotulo, valor, className }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3', className)}>
      <span className="tipo-rotulo w-full text-suave">{rotulo}</span>
      <code className="tipo-dado min-w-0 flex-1 text-[13px] break-all">{valor}</code>
      <CopyButton texto={valor} />
    </div>
  )
}

export function Codigo({ children }: { children: ReactNode }) {
  return <code className="tipo-dado rounded bg-papel px-1 text-[12px] text-ink ring-1 ring-linha">{children}</code>
}

/** Lista numerada de um passo a passo curto. */
export function Passos({ passos }: { passos: Array<{ titulo: string; conteudo: ReactNode }> }) {
  return (
    <ol className="space-y-4">
      {passos.map((p, i) => (
        <li key={p.titulo} className="flex gap-3">
          <span className="tipo-dado grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] text-white">{i + 1}</span>
          <div className="min-w-0 flex-1 text-[14px] leading-6">
            <p className="font-semibold">{p.titulo}</p>
            <div className="text-ink/80">{p.conteudo}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Cartão que começa fechado: ajustes raros (trocar credenciais) e guias que já foram cumpridos. */
export function Recolhivel({
  titulo,
  descricao,
  aberto = false,
  children,
}: {
  titulo: string
  descricao?: string
  aberto?: boolean
  children: ReactNode
}) {
  return (
    <details open={aberto} className="group rounded-cartao border border-linha bg-superficie shadow-cartao">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-cartao px-4 py-3.5 hover:bg-papel/60 lg:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{titulo}</span>
          {descricao && <span className="block text-[13px] text-suave">{descricao}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-sutil transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-linha p-4 lg:p-5">{children}</div>
    </details>
  )
}

/**
 * Ação que desliga ou apaga algo (desconectar uma conta, por exemplo).
 * Fica sempre no fim da página, separada dos botões do dia a dia, para ninguém clicar por engano.
 */
export function ZonaDeRisco({ titulo, descricao, children }: { titulo: string; descricao: ReactNode; children: ReactNode }) {
  return (
    <section aria-label="Zona de risco" className="rounded-cartao border border-perigo/25 bg-superficie">
      <h2 className="tipo-rotulo border-b border-perigo/15 px-4 py-2.5 text-perigo lg:px-5">Zona de risco</h2>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 lg:px-5">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[15px] font-semibold">{titulo}</p>
          <p className="mt-0.5 text-[13px] text-suave">{descricao}</p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </section>
  )
}

/** Aviso curto no lugar de um ajuste que só administradores fazem. */
export function SomenteAdmin({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-suave">{children}</p>
}
