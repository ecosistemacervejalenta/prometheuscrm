'use client'

import { useEffect, useState, type RefObject } from 'react'

/** Largura atual do elemento, em px (0 até a primeira medida). Para gráficos que desenham pelo tamanho real. */
export function useLargura(ref: RefObject<HTMLElement | null>) {
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observador = new ResizeObserver(([entrada]) => setLargura(Math.round(entrada.contentRect.width)))
    observador.observe(el)
    return () => observador.disconnect()
  }, [ref])
  return largura
}
