'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Recarrega os números da campanha a cada 10 s enquanto ela está em andamento (aba visível). */
export function AtualizacaoAutomatica() {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 10_000)
    return () => clearInterval(id)
  }, [router])
  return null
}
