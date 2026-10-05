import Image from 'next/image'
import { useId, type CSSProperties } from 'react'

import { cn } from '@/lib/utils'

import type { Canal } from '../canais'

/** Coroa de rei (três pontas com pérolas, rubi e faixa cravejada), em ouro. */
export function Coroa({ className, style }: { className?: string; style?: CSSProperties }) {
  const ouro = useId()
  return (
    <svg viewBox="0 0 64 46" className={cn('shrink-0', className)} style={style} aria-hidden>
      <defs>
        <linearGradient id={ouro} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FAD95A" />
          <stop offset="1" stopColor="#C08A00" />
        </linearGradient>
      </defs>
      <path
        d="M7 34 4 13l14.5 9.5L32 5l13.5 17.5L60 13l-3 21Z"
        fill={`url(#${ouro})`}
        stroke="#8A6510"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="5.5" y="33" width="53" height="9.5" rx="3" fill={`url(#${ouro})`} stroke="#8A6510" strokeWidth="2" />
      <circle cx="4" cy="10.5" r="3.3" fill="#FAD95A" stroke="#8A6510" strokeWidth="1.6" />
      <circle cx="32" cy="4" r="3.6" fill="#FAD95A" stroke="#8A6510" strokeWidth="1.6" />
      <circle cx="60" cy="10.5" r="3.3" fill="#FAD95A" stroke="#8A6510" strokeWidth="1.6" />
      <circle cx="32" cy="24" r="4" fill="#D7263D" stroke="#8A1424" strokeWidth="1.2" />
      <circle cx="18" cy="37.75" r="2.3" fill="#D7263D" />
      <circle cx="32" cy="37.75" r="2.5" fill="#2F7FF0" />
      <circle cx="46" cy="37.75" r="2.3" fill="#D7263D" />
    </svg>
  )
}

/** Marca do Grupo VIP (não há logotipo): "Grupo VIP" com a coroa de rei sobre o "VIP". */
export function MarcaGrupoVip({ altura = 40, className }: { altura?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Grupo VIP"
      className={cn('inline-flex items-end gap-[0.28em] leading-none text-ink select-none', className)}
      style={{ fontSize: Math.round(altura * 0.56) }}
    >
      <span aria-hidden className="pb-[0.08em] text-[0.6em] font-semibold tracking-tight text-suave">
        Grupo
      </span>
      <span aria-hidden className="inline-flex flex-col items-center">
        <Coroa style={{ width: '1.15em' }} className="-mb-[0.04em] -rotate-6" />
        <span className="font-display text-[1em] leading-[0.82] font-extrabold tracking-tight [font-stretch:108%]">VIP</span>
      </span>
    </span>
  )
}

/** Logotipo do canal (arquivos de /public/canais) ou a marca do Grupo VIP. */
export function MarcaCanal({ canal, altura = 28, className }: { canal: Canal; altura?: number; className?: string }) {
  if (!canal.logo) return <MarcaGrupoVip altura={Math.round(altura * 1.7)} className={className} />
  const { src, alt, largura, altura: alturaOriginal, escala } = canal.logo
  const h = Math.round(altura * escala)
  return (
    <Image
      src={src}
      alt={alt}
      width={Math.round((h * largura) / alturaOriginal)}
      height={h}
      className={cn('w-auto select-none', className)}
      style={{ height: h }}
    />
  )
}
