'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button, type TamanhoBotao, type VarianteBotao } from './button'

export function CopyButton({
  texto,
  rotulo = 'Copiar',
  variante = 'secundario',
  tamanho = 'sm',
}: {
  texto: string
  rotulo?: string
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
}) {
  const [copiado, setCopiado] = useState(false)

  return (
    <Button
      variante={variante}
      tamanho={tamanho}
      onClick={async () => {
        await navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
      }}
    >
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copiado ? 'Copiado!' : rotulo}
    </Button>
  )
}
