'use client'

import { useState, type ReactNode } from 'react'

import { Field, Textarea } from '@/components/form/fields'
import { preencherModelo } from '@/lib/whatsapp'

/** *negrito* do WhatsApp → <strong> (só para a prévia). */
function comNegrito(texto: string): ReactNode[] {
  return texto
    .split(/(\*[^*\n]+\*)/g)
    .map((trecho, i) => (/^\*[^*\n]+\*$/.test(trecho) ? <strong key={i}>{trecho.slice(1, -1)}</strong> : trecho))
}

/**
 * Editor de um modelo de mensagem: o texto, as variáveis (um clique insere no cursor)
 * e, ao lado, como a mensagem chega no WhatsApp com dados de exemplo.
 */
export function EditorMensagem({
  name,
  titulo,
  descricao,
  valorInicial,
  variaveis,
  exemplo,
  linhas,
}: {
  name: string
  titulo: string
  descricao: string
  valorInicial: string
  variaveis: readonly string[]
  /** Valores de exemplo para a prévia (chave sem as chaves: `nome`, `total`...). */
  exemplo: Record<string, string>
  linhas: number
}) {
  const [texto, setTexto] = useState(valorInicial)

  function inserir(variavel: string) {
    const campo = document.getElementById(name) as HTMLTextAreaElement | null
    const inicio = campo?.selectionStart ?? texto.length
    const fim = campo?.selectionEnd ?? texto.length
    setTexto(texto.slice(0, inicio) + variavel + texto.slice(fim))
    // Devolve o foco com o cursor logo depois da variável inserida.
    requestAnimationFrame(() => {
      campo?.focus()
      campo?.setSelectionRange(inicio + variavel.length, inicio + variavel.length)
    })
  }

  const previa = preencherModelo(texto, exemplo)

  return (
    <section className="border-t border-linha px-4 py-5 first:border-t-0 lg:px-5">
      <h3 className="text-[15px] font-semibold">{titulo}</h3>
      <p className="mt-0.5 text-[13px] text-suave">{descricao}</p>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Field label="Texto da mensagem" name={name}>
            <Textarea
              name={name}
              rows={linhas}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="tipo-dado text-[13px]"
            />
          </Field>
          <div className="mt-3">
            <p className="tipo-rotulo text-suave">Variáveis — clique para inserir</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {variaveis.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => inserir(v)}
                  className="tipo-dado rounded-md bg-papel px-2 py-1 text-[12px] text-ink ring-1 ring-linha transition-colors ring-inset hover:bg-volt-50 hover:ring-volt-600"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <p className="tipo-rotulo mb-1.5 text-suave">Prévia com dados de exemplo</p>
          <div className="rounded-xl bg-papel p-3 ring-1 ring-linha ring-inset">
            <p className="ml-auto w-fit max-w-full rounded-xl rounded-tr-sm bg-whatsapp-50 px-3 py-2 text-[13px] leading-5 break-words whitespace-pre-wrap text-ink">
              {previa ? comNegrito(previa) : <span className="text-suave">A mensagem está vazia.</span>}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
