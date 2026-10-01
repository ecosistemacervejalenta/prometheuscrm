'use client'

import type { ReactNode } from 'react'

import { Button, type VarianteBotao } from './button'

export function PrintButton({ children, variante = 'secundario' }: { children: ReactNode; variante?: VarianteBotao }) {
  return (
    <Button variante={variante} onClick={() => window.print()}>
      {children}
    </Button>
  )
}
