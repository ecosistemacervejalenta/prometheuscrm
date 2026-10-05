'use client'

import { useState } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const TAMANHOS = {
  sm: 'size-8 rounded-full',
  md: 'size-9 rounded-full',
  lg: 'size-16 rounded-2xl',
}

/**
 * Foto de perfil do WhatsApp; sem foto (ou link vencido/bloqueado) mostra as
 * iniciais, igual ao Avatar do restante do CRM.
 */
export function FotoContato({
  nome,
  foto,
  tamanho = 'md',
  className,
}: {
  nome: string | null | undefined
  foto: string | null | undefined
  tamanho?: keyof typeof TAMANHOS
  className?: string
}) {
  const [falhou, setFalhou] = useState<string | null>(null)

  if (!foto || falhou === foto) return <Avatar nome={nome} tamanho={tamanho} className={className} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- CDN do WhatsApp, link temporário (sem otimização do Next)
    <img
      src={foto}
      alt=""
      aria-hidden
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFalhou(foto)}
      className={cn('shrink-0 bg-papel object-cover ring-1 ring-linha', TAMANHOS[tamanho], className)}
    />
  )
}
