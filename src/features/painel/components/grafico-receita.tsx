'use client'

import { useState } from 'react'

import { formatarDataCurta, formatarMoeda, formatarMoedaCompacta } from '@/lib/format'
import { CANAIS } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { CanalVenda } from '@/types'

import type { SemanaReceita } from '../queries'

/**
 * Cores do gráfico por canal — paleta categórica validada (skill dataviz:
 * banda de luminosidade, croma, separação para daltonismo e visão normal).
 * Ordem fixa de empilhamento (a cor segue o canal, nunca a posição).
 */
const SERIES: Array<{ canal: CanalVenda; cor: string }> = [
  { canal: 'grupo_vip', cor: '#eda100' },
  { canal: 'shopify', cor: '#2a78d6' },
  { canal: 'whatsapp', cor: '#1baf7a' },
  { canal: 'app', cor: '#4a3aa7' },
  { canal: 'loja', cor: '#eb6834' },
]

const ALTURA = 200

export function GraficoReceita({ semanas }: { semanas: SemanaReceita[] }) {
  const [ativa, setAtiva] = useState<number | null>(null)
  // Escala mínima de R$ 100 evita eixo sem sentido quando ainda não há vendas.
  const maximo = Math.max(...semanas.map((s) => s.total), 100)
  const escala = Math.pow(10, Math.floor(Math.log10(maximo)))
  const teto = Math.ceil(maximo / escala) * escala
  const presentes = SERIES.filter((s) => semanas.some((sem) => (sem.valores[s.canal] ?? 0) > 0))
  const legenda = presentes.length > 0 ? presentes : SERIES.slice(0, 3)

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
        {legenda.map((s) => (
          <li key={s.canal} className="flex items-center gap-1.5 text-[13px] text-suave">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.cor }} aria-hidden />
            {CANAIS[s.canal].rotulo}
          </li>
        ))}
      </ul>

      <div className="relative pl-12" onMouseLeave={() => setAtiva(null)}>
        {/* Grade (linhas finas, recessivas) */}
        {[1, 0.5, 0].map((fracao) => (
          <div
            key={fracao}
            className="pointer-events-none absolute right-0 left-12 border-t border-linha"
            style={{ top: ALTURA * (1 - fracao) }}
          >
            <span className="tipo-dado absolute -top-2.5 -left-12 w-10 text-right text-[11px] text-sutil">
              {formatarMoedaCompacta(teto * fracao).replace('R$', '').trim()}
            </span>
          </div>
        ))}

        <div className="relative flex items-end justify-between gap-1" style={{ height: ALTURA }}>
          {semanas.map((s, indice) => {
            const atual = indice === semanas.length - 1
            const segmentos = SERIES.filter((serie) => (s.valores[serie.canal] ?? 0) > 0)
            return (
              <button
                key={s.semana}
                type="button"
                onMouseEnter={() => setAtiva(indice)}
                onFocus={() => setAtiva(indice)}
                onBlur={() => setAtiva(null)}
                aria-label={`Semana de ${formatarDataCurta(s.semana)}: ${formatarMoeda(s.total)}`}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
              >
                <span
                  className={cn(
                    'flex w-full max-w-6 flex-col-reverse gap-[2px] rounded-t-[4px] transition-opacity',
                    ativa !== null && ativa !== indice && 'opacity-40',
                  )}
                  style={{ height: `${(s.total / teto) * 100}%` }}
                >
                  {segmentos.map((serie, i) => (
                    <span
                      key={serie.canal}
                      className={cn(i === segmentos.length - 1 && 'rounded-t-[4px]')}
                      style={{ background: serie.cor, flexGrow: s.valores[serie.canal] ?? 0, minHeight: 2 }}
                    />
                  ))}
                </span>
                {atual && <span className="absolute -bottom-1 h-0.5 w-6 rounded-full bg-ink" aria-hidden />}
                {ativa === indice && (
                  <span
                    role="tooltip"
                    className={cn(
                      'pointer-events-none absolute bottom-full z-10 mb-2 block min-w-44 rounded-xl bg-ink px-3 py-2.5 text-left text-[13px] text-white shadow-flutuante',
                      indice > semanas.length / 2 ? 'right-0' : 'left-0',
                    )}
                  >
                    <span className="tipo-rotulo mb-1.5 block text-white/60">Semana de {formatarDataCurta(s.semana)}</span>
                    {segmentos.map((serie) => (
                      <span key={serie.canal} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-[2px]" style={{ background: serie.cor }} aria-hidden />
                          {CANAIS[serie.canal].rotulo}
                        </span>
                        <span className="tipo-dado">{formatarMoeda(s.valores[serie.canal])}</span>
                      </span>
                    ))}
                    <span className="mt-1.5 flex justify-between gap-4 border-t border-white/15 pt-1.5 font-semibold">
                      Total <span className="tipo-dado">{formatarMoeda(s.total)}</span>
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="tipo-dado mt-3 flex justify-between text-[11px] text-suave">
          <span>{formatarDataCurta(semanas[0]?.semana)}</span>
          <span>{formatarDataCurta(semanas[Math.floor(semanas.length / 2)]?.semana)}</span>
          <span>esta semana</span>
        </div>
      </div>

      <details className="mt-4 text-[13px]">
        <summary className="cursor-pointer font-semibold text-suave hover:text-ink">Ver como tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="tipo-rotulo text-suave">
              <th className="py-1 font-medium">Semana</th>
              {legenda.map((s) => (
                <th key={s.canal} className="py-1 text-right font-medium">{CANAIS[s.canal].rotulo}</th>
              ))}
              <th className="py-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="tipo-dado">
            {semanas.map((s) => (
              <tr key={s.semana} className="border-t border-linha">
                <td className="py-1">{formatarDataCurta(s.semana)}</td>
                {legenda.map((serie) => (
                  <td key={serie.canal} className="py-1 text-right">{formatarMoeda(s.valores[serie.canal] ?? 0)}</td>
                ))}
                <td className="py-1 text-right">{formatarMoeda(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
