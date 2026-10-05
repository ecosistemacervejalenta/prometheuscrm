'use client'

import { useState } from 'react'

import { formatarMoeda, formatarMoedaCompacta, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

export type FatiaPizza = { id: string; nome: string; cor: string; valor: number; quantidade: number }

const porcentagem = (p: number) => `${(p * 100).toLocaleString('pt-BR', { maximumFractionDigits: p > 0 && p < 0.1 ? 1 : 0 })}%`

const TAMANHO = 200
const RAIO = 92
const ESPESSURA = 22
/** Espaço de 2 px (na borda externa) entre as fatias. */
const VAO = 2 / RAIO

function arco(inicio: number, fim: number): string {
  const r1 = RAIO
  const r0 = RAIO - ESPESSURA
  const c = TAMANHO / 2
  const ponto = (r: number, a: number) => `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`
  const grande = fim - inicio > Math.PI ? 1 : 0
  return `M ${ponto(r1, inicio)} A ${r1} ${r1} 0 ${grande} 1 ${ponto(r1, fim)} L ${ponto(r0, fim)} A ${r0} ${r0} 0 ${grande} 0 ${ponto(r0, inicio)} Z`
}

/**
 * Gráfico de pizza (rosca): participação de cada fatia no total.
 * Total no centro e legenda com % e valores (o tooltip só complementa).
 * `ativa`/`aoAtivar` permitem destacar a fatia a partir de outra lista (ex.: um ranking ao lado).
 */
export function GraficoPizza({
  fatias,
  rotuloQuantidade = 'pedidos',
  rotuloGrafico = 'Participação de cada canal no faturamento',
  mostrarLegenda = true,
  ativa: ativaExterna,
  aoAtivar,
}: {
  fatias: FatiaPizza[]
  /** Texto da quantidade no centro: "357 pedidos", "12 contas"... */
  rotuloQuantidade?: string
  rotuloGrafico?: string
  /** Sem legenda quando outra lista ao lado já faz esse papel. */
  mostrarLegenda?: boolean
  ativa?: string | null
  aoAtivar?: (id: string | null) => void
}) {
  const [ativaInterna, setAtivaInterna] = useState<string | null>(null)
  const ativa = ativaExterna !== undefined ? ativaExterna : ativaInterna
  const setAtiva = (id: string | null) => (aoAtivar ? aoAtivar(id) : setAtivaInterna(id))
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  const visiveis = fatias.filter((f) => f.valor > 0)
  const destaque = visiveis.find((f) => f.id === ativa)

  // Ângulo inicial de cada fatia = soma das frações anteriores.
  const vao = visiveis.length > 1 ? VAO / 2 : 0
  const segmentos = visiveis.map((f, i) => {
    const antes = visiveis.slice(0, i).reduce((s, g) => s + g.valor, 0) / total
    const fracao = f.valor / total
    return { ...f, fracao, inicio: antes * 2 * Math.PI + vao, fim: (antes + fracao) * 2 * Math.PI - vao }
  })

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative shrink-0" style={{ width: TAMANHO, height: TAMANHO }}>
        <svg viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} width={TAMANHO} height={TAMANHO} role="group" aria-label={rotuloGrafico}>
          {total <= 0 ? (
            <circle cx={TAMANHO / 2} cy={TAMANHO / 2} r={RAIO - ESPESSURA / 2} fill="none" stroke="var(--color-linha)" strokeWidth={ESPESSURA} />
          ) : segmentos.length === 1 ? (
            <circle
              cx={TAMANHO / 2}
              cy={TAMANHO / 2}
              r={RAIO - ESPESSURA / 2}
              fill="none"
              stroke={segmentos[0].cor}
              strokeWidth={ESPESSURA}
              tabIndex={0}
              aria-label={`${segmentos[0].nome}: 100% · ${formatarMoeda(segmentos[0].valor)}`}
              onPointerEnter={() => setAtiva(segmentos[0].id)}
              onPointerLeave={() => setAtiva(null)}
              onFocus={() => setAtiva(segmentos[0].id)}
              onBlur={() => setAtiva(null)}
              className="outline-none"
            />
          ) : (
            segmentos.map((s) => (
              <path
                key={s.id}
                d={arco(s.inicio, s.fim)}
                fill={s.cor}
                tabIndex={0}
                aria-label={`${s.nome}: ${porcentagem(s.fracao)} · ${formatarMoeda(s.valor)}`}
                onPointerEnter={() => setAtiva(s.id)}
                onPointerLeave={() => setAtiva(null)}
                onFocus={() => setAtiva(s.id)}
                onBlur={() => setAtiva(null)}
                className={cn('cursor-default transition-opacity outline-none', ativa && ativa !== s.id && 'opacity-35')}
              />
            ))
          )}
        </svg>
        {/* Centro: total (ou a fatia em destaque) */}
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          {destaque ? (
            <>
              <p className="text-[12px] font-semibold text-suave">{destaque.nome}</p>
              <p className="tipo-numero text-[22px] leading-7" style={{ fontVariantNumeric: 'proportional-nums' }}>
                {porcentagem(destaque.valor / total)}
              </p>
              <p className="tipo-dado text-[12px] text-suave">{formatarMoeda(destaque.valor)}</p>
            </>
          ) : (
            <>
              <p className="tipo-rotulo text-suave">Total</p>
              <p className="tipo-numero text-[22px] leading-7" style={{ fontVariantNumeric: 'proportional-nums' }}>
                {formatarMoedaCompacta(total)}
              </p>
              <p className="text-[12px] text-suave">
                {formatarNumero(fatias.reduce((s, f) => s + f.quantidade, 0))} {rotuloQuantidade}
              </p>
            </>
          )}
        </div>
      </div>

      {mostrarLegenda && (
        <ul className="grid w-full min-w-0 gap-2.5">
          {fatias.map((f) => {
            const fracao = total > 0 ? f.valor / total : 0
            return (
              <li
                key={f.id}
                onPointerEnter={() => f.valor > 0 && setAtiva(f.id)}
                onPointerLeave={() => setAtiva(null)}
                className={cn('flex items-center gap-3 rounded-lg transition-opacity', ativa && ativa !== f.id && 'opacity-50')}
              >
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{f.nome}</span>
                <span className="tipo-dado shrink-0 text-[12px] text-suave">{formatarMoeda(f.valor)}</span>
                <span className="tipo-dado w-12 shrink-0 text-right text-[13px] text-ink">{porcentagem(fracao)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
