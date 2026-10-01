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
 */
export function ActionForm({
  action,
  children,
  className,
  aoConcluir,
  limparAoConcluir = false,
  mostrarSucesso = true,
}: {
  action: AcaoFormulario
  children: ReactNode
  className?: string
  aoConcluir?: (estado: EstadoAcao) => void
  limparAoConcluir?: boolean
  mostrarSucesso?: boolean
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
          startTransition(() => despachar(dados))
        }}
      >
        {estado.mensagem && (estado.ok ? mostrarSucesso : true) && (
          <Alert tom={estado.ok ? 'sucesso' : 'erro'} className="mb-5">
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
