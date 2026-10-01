'use client'

import { useTransition, type ReactNode } from 'react'

import type { EstadoAcao } from '@/lib/acoes'

import { Button, type TamanhoBotao, type VarianteBotao } from './button'
import { useAvisos } from './toaster'

/**
 * Botão que executa uma Server Action de um clique (marcar como pago, excluir...).
 * Mostra carregando, pede confirmação opcional e exibe o resultado em um aviso.
 */
export function ActionButton({
  acao,
  children,
  confirmar,
  variante = 'secundario',
  tamanho = 'sm',
  className,
  titulo,
}: {
  acao: () => Promise<EstadoAcao | void>
  children: ReactNode
  confirmar?: string
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  className?: string
  titulo?: string
}) {
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()

  return (
    <Button
      variante={variante}
      tamanho={tamanho}
      className={className}
      carregando={pendente}
      title={titulo}
      aria-label={titulo}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return
        iniciar(async () => {
          const resultado = await acao()
          if (resultado?.mensagem) avisar(resultado.mensagem, resultado.ok === false ? 'erro' : 'sucesso')
        })
      }}
    >
      {children}
    </Button>
  )
}
