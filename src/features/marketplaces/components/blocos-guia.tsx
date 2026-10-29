import type { ReactNode } from 'react'

import { CopyButton } from '@/components/ui/copy-button'

/** Peças de texto dos guias de conexão: listas, códigos e textos prontos para copiar. */

export function Codigo({ children }: { children: ReactNode }) {
  return <code className="tipo-dado rounded bg-papel px-1 text-[12px] text-ink ring-1 ring-linha">{children}</code>
}

export function Lista({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-suave">{children}</ol>
}

/** Valor curto para colar num campo (URL, nome, domínio). */
export function CampoCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
      <span className="tipo-rotulo w-full text-suave">{rotulo}</span>
      <code className="tipo-dado flex-1 text-[13px] break-all">{valor}</code>
      <CopyButton texto={valor} />
    </div>
  )
}

/** Texto pronto (frases e parágrafos) para colar num formulário. */
export function TextoPronto({ rotulo, texto, dica }: { rotulo: string; texto: string; dica?: string }) {
  return (
    <div className="rounded-xl bg-papel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tipo-rotulo text-suave">{rotulo}</span>
        <CopyButton texto={texto} />
      </div>
      <p className="mt-2 text-[13px] leading-5 whitespace-pre-line text-ink">{texto}</p>
      {dica && <p className="mt-1.5 text-[12px] text-suave">{dica}</p>}
    </div>
  )
}

/** Tabela "campo do formulário → o que responder". */
export function Respostas({ itens }: { itens: Array<{ campo: string; resposta: ReactNode }> }) {
  return (
    <dl className="divide-y divide-linha rounded-xl border border-linha">
      {itens.map((i) => (
        <div key={i.campo} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
          <dt className="text-[13px] font-semibold text-ink">{i.campo}</dt>
          <dd className="text-[13px] text-suave">{i.resposta}</dd>
        </div>
      ))}
    </dl>
  )
}
