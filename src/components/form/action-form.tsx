'use client'

import { createContext, startTransition, use, useActionState, useEffect, useRef, type ReactNode } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button, type VarianteBotao, type TamanhoBotao } from '@/components/ui/button'
import { estadoInicial, type EstadoAcao } from '@/lib/acoes'

export type AcaoFormulario = (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>

const ContextoFormulario = createContext<{ estado: EstadoAcao; pendente: boolean }>({
  estado: estadoInicial,
  pendente: false,
})

export function useFormulario() {
  return use(ContextoFormulario)
}

/**
 * Formulário ligado a uma Server Action.
 * - Mantém os valores digitados quando a validação falha (não reseta o form).
 * - Exibe a mensagem geral no topo e os erros por campo via <Field name="...">.
 * - Em caso de sucesso, a action normalmente faz redirect(); ou use `aoConcluir`.
 * - `antesDeEnviar` pode segurar o envio (devolvendo false) para pedir uma confirmação e mandar
 *   de novo depois; também pode acrescentar campos aos dados.
 */
export function ActionForm({
  action,
  children,
  className,
  aoConcluir,
  antesDeEnviar,
  limparAoConcluir = false,
  mostrarSucesso = true,
  classeMensagem = 'mb-5',
}: {
  action: AcaoFormulario
  children: ReactNode
  className?: string
  aoConcluir?: (estado: EstadoAcao) => void
  /** Roda a cada envio, antes da action. Devolver false cancela este envio. */
  antesDeEnviar?: (dados: FormData) => boolean
  limparAoConcluir?: boolean
  mostrarSucesso?: boolean
  /** Margens da mensagem geral (para formulários sem padding próprio, como os cartões de ajuste). */
  classeMensagem?: string
}) {
  const [estado, despachar, pendente] = useActionState(action, estadoInicial)
  const formulario = useRef<HTMLFormElement>(null)
  const aoConcluirRef = useRef(aoConcluir)

  useEffect(() => {
    aoConcluirRef.current = aoConcluir
  })

  useEffect(() => {
    if (!estado.ok) return
    if (limparAoConcluir) formulario.current?.reset()
    aoConcluirRef.current?.(estado)
  }, [estado, limparAoConcluir])

  return (
    <ContextoFormulario value={{ estado, pendente }}>
      <form
        ref={formulario}
        noValidate
        className={className}
        onSubmit={(evento) => {
          evento.preventDefault()
          const dados = new FormData(evento.currentTarget)
          if (antesDeEnviar && !antesDeEnviar(dados)) return
          startTransition(() => despachar(dados))
        }}
      >
        {estado.mensagem && (estado.ok ? mostrarSucesso : true) && (
          <Alert tom={estado.ok ? 'sucesso' : 'erro'} className={classeMensagem}>
            {estado.mensagem}
          </Alert>
        )}
        {children}
      </form>
    </ContextoFormulario>
  )
}

export function SubmitButton({
  children,
  variante = 'primario',
  tamanho,
  bloco,
  className,
}: {
  children: ReactNode
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  bloco?: boolean
  className?: string
}) {
  const { pendente } = useFormulario()
  return (
    <Button type="submit" variante={variante} tamanho={tamanho} bloco={bloco} carregando={pendente} className={className}>
      {children}
    </Button>
  )
}
