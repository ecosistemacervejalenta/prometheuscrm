import { Fragment, type ReactNode } from 'react'

/**
 * Texto com a formatação do WhatsApp: *negrito*, _itálico_, ~riscado~,
 * ```monoespaçado``` e links clicáveis. Gera elementos React (sem HTML cru).
 */

const LINK = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
const FORMATO = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g

function formatar(trecho: string, chave: string): ReactNode[] {
  return trecho.split(FORMATO).map((parte, i) => {
    const k = `${chave}-${i}`
    if (parte.length > 6 && parte.startsWith('```') && parte.endsWith('```')) {
      return <code key={k} className="tipo-dado rounded bg-ink/5 px-1 text-[13px]">{parte.slice(3, -3)}</code>
    }
    if (parte.length > 2) {
      const meio = parte.slice(1, -1)
      if (parte.startsWith('*') && parte.endsWith('*')) return <strong key={k} className="font-semibold">{meio}</strong>
      if (parte.startsWith('_') && parte.endsWith('_')) return <em key={k}>{meio}</em>
      if (parte.startsWith('~') && parte.endsWith('~')) return <s key={k}>{meio}</s>
    }
    return <Fragment key={k}>{parte}</Fragment>
  })
}

export function TextoWhatsapp({ texto }: { texto: string }) {
  return (
    <span className="break-words whitespace-pre-wrap">
      {texto.split(LINK).map((parte, i) =>
        i % 2 === 1 ? (
          <a key={i} href={parte} target="_blank" rel="noopener noreferrer" className="break-all text-shopify-700 underline underline-offset-2">
            {parte}
          </a>
        ) : (
          <Fragment key={i}>{formatar(parte, String(i))}</Fragment>
        ),
      )}
    </span>
  )
}
