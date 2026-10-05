'use client'

import { useState } from 'react'

import { formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

export type Segmento = { id: string; nome: string; cor: string; valor: number; participacao: number }

const porcentagem = (p: number) =>
  `${(p * 100).toLocaleString('pt-BR', { maximumFractionDigits: p < 0.1 ? 1 : 0 })}%`

/**
 * Participação de cada canal no total (barra empilhada horizontal).
 * Rótulos diretos nas fatias que comportam o texto, legenda sempre presente e
 * tooltip ao passar o mouse ou focar pelo teclado (os valores também estão na legenda).
 */
export function BarraParticipacao({ segmentos }: { segmentos: Segmento[] }) {
  const [ativo, setAtivo] = useState<string | null>(null)
  const visiveis = segmentos.filter((s) => s.participacao > 0)
  const ultimo = visiveis.length - 1

  return (
    <div>
      {/* Rótulos diretos (só onde cabem; os demais ficam na legenda e no tooltip) */}
      <div className="flex gap-[2px]" aria-hidden>
        {visiveis.map((s) => (
          <div key={s.id} className="min-w-0 pb-1.5" style={{ flexBasis: `${s.participacao * 100}%` }}>
            {s.participacao >= 0.12 && <span className="tipo-dado block truncate text-[12px] text-suave">{porcentagem(s.participacao)}</span>}
          </div>
        ))}
      </div>

      <div role="group" aria-label="Participação de cada canal no total vendido" className="relative flex gap-[2px]">
        {visiveis.map((s, i) => {
          const selecionado = ativo === s.id
          return (
            <div
              key={s.id}
              tabIndex={0}
              aria-label={`${s.nome}: ${porcentagem(s.participacao)} do total, ${formatarMoeda(s.valor)}`}
              onPointerEnter={() => setAtivo(s.id)}
              onPointerLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(s.id)}
              onBlur={() => setAtivo(null)}
              className="relative -my-2 flex min-w-0 cursor-default items-center py-2 outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ink focus-visible:[&>span]:ring-offset-2"
              style={{ flexBasis: `${s.participacao * 100}%` }}
            >
              <span
                className={cn(
                  'block h-3.5 w-full transition-opacity',
                  i === 0 && 'rounded-l-[4px]',
                  i === ultimo && 'rounded-r-[4px]',
                  ativo && !selecionado && 'opacity-40',
                )}
                style={{ background: s.cor }}
              />
              {selecionado && (
                <div
                  role="tooltip"
                  className={cn(
                    'pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg border border-linha bg-superficie px-3 py-2 whitespace-nowrap shadow-lg',
                    // Nas pontas, o tooltip encosta na borda da fatia para não vazar do cartão.
                    i === 0 ? 'left-0' : i === ultimo ? 'right-0' : 'left-1/2 -translate-x-1/2',
                  )}
                >
                  <p className="tipo-dado text-[14px] font-semibold text-ink">{formatarMoeda(s.valor)}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-suave">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.cor }} aria-hidden />
                    {s.nome} · {porcentagem(s.participacao)}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        {segmentos.map((s) => (
          <li key={s.id} className="flex min-w-0 items-start gap-2">
            <span className="mt-[5px] size-2.5 shrink-0 rounded-[3px]" style={{ background: s.cor }} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">{s.nome}</span>
              <span className="tipo-dado block text-[12px] text-suave">{porcentagem(s.participacao)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
