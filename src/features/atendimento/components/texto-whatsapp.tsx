import { Fragment, type ReactNode } from 'react'

/**
 * Texto com a formatação do WhatsApp: *negrito*, _itálico_, ~riscado~,
 * ```monoespaçado```, citação ("> " no começo da linha) e links clicáveis.
 * Gera elementos React (sem HTML cru).
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

function comLinks(texto: string, chave: string): ReactNode[] {
  return texto.split(LINK).map((parte, i) =>
    i % 2 === 1 ? (
      <a key={`${chave}-${i}`} href={parte} target="_blank" rel="noopener noreferrer" className="break-all text-shopify-700 underline underline-offset-2">
        {parte}
      </a>
    ) : (
      <Fragment key={`${chave}-${i}`}>{formatar(parte, `${chave}-${i}`)}</Fragment>
    ),
  )
}

/** Linhas seguidas com "> " formam uma citação; o resto fica como texto corrido. */
function blocos(texto: string) {
  const lista: { citacao: boolean; linhas: string[] }[] = []
  for (const linha of texto.split('\n')) {
    const citacao = linha.startsWith('> ')
    const ultimo = lista.at(-1)
    if (ultimo && ultimo.citacao === citacao) ultimo.linhas.push(citacao ? linha.slice(2) : linha)
    else lista.push({ citacao, linhas: [citacao ? linha.slice(2) : linha] })
  }
  return lista
}

export function TextoWhatsapp({ texto }: { texto: string }) {
  return (
    <span className="break-words whitespace-pre-wrap">
      {blocos(texto).map((b, i) =>
        b.citacao ? (
          <span key={i} className="my-0.5 block border-l-[3px] border-current/25 pl-2 opacity-80">
            {comLinks(b.linhas.join('\n'), String(i))}
          </span>
        ) : (
          <Fragment key={i}>{comLinks(b.linhas.join('\n'), String(i))}</Fragment>
        ),
      )}
    </span>
  )
}
