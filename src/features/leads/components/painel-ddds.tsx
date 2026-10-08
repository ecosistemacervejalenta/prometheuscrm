'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { classesBotao } from '@/components/ui/button'
import { formatarNumero, formatarPorcentagem } from '@/lib/format'
import { cn } from '@/lib/utils'

import { REGIAO_DO_DDD, resumirDdds, type ContagemDdd } from '../ddd'
import { MapaDdds } from './mapa-ddds'

const NO_RANKING = 10

/**
 * Números com WhatsApp por DDD: mapa do Brasil e ranking do maior para o menor.
 * O DDD sob o mouse (ou com o foco do teclado) no ranking fica em destaque no mapa, e vice-versa.
 */
export function PainelDdds({ contagem }: { contagem: ContagemDdd[] }) {
  const [ativo, setAtivo] = useState<string | null>(null)
  const [todos, setTodos] = useState(false)
  const { total, semDdd, porDdd } = resumirDdds(contagem)

  if (porDdd.length === 0) {
    return <p className="py-10 text-center text-sm text-suave">Nenhum número com DDD do Brasil ainda. Importe uma lista com WhatsApp.</p>
  }

  const ordenados = [...porDdd].sort((a, b) => b.numeros - a.numeros)
  const maior = ordenados[0].numeros
  const visiveis = todos ? ordenados : ordenados.slice(0, NO_RANKING)
  const tres = ordenados.slice(0, 3)
  const somaTres = tres.reduce((s, d) => s + d.numeros, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
      <MapaDdds porDdd={ordenados} total={total} ativo={ativo} aoAtivar={setAtivo} />

      <div className="min-w-0">
        {tres.length === 3 && (
          <p className="mb-3 text-[13px] text-suave">
            Os 3 maiores ({tres[0].ddd}, {tres[1].ddd} e {tres[2].ddd}) somam{' '}
            <strong className="font-semibold text-ink">{formatarPorcentagem(somaTres / total)}</strong> dos números.
          </p>
        )}
        <p className="tipo-rotulo mb-1 px-2 text-suave">Do maior para o menor</p>
        <ol className="grid grid-cols-1 gap-0.5" aria-label="Números por DDD, do maior para o menor">
          {visiveis.map((d, i) => (
            <li
              key={d.ddd}
              tabIndex={0}
              onPointerEnter={() => setAtivo(d.ddd)}
              onPointerLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(d.ddd)}
              onBlur={() => setAtivo(null)}
              className={cn('cursor-default rounded-lg px-2 py-1.5 transition-colors', ativo === d.ddd && 'bg-papel')}
            >
              <div className="flex items-baseline gap-2.5">
                <span className="tipo-dado w-5 shrink-0 text-right text-[12px] text-sutil">{i + 1}</span>
                <span className="tipo-dado shrink-0 text-[13px] font-semibold text-ink">{d.ddd}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-suave">{REGIAO_DO_DDD[d.ddd]}</span>
                <span className="tipo-dado shrink-0 text-[13px] text-ink">{formatarNumero(d.numeros)}</span>
                <span className="tipo-dado w-12 shrink-0 text-right text-[12px] text-suave">{formatarPorcentagem(d.numeros / total)}</span>
              </div>
              <div className="mt-1 ml-[1.875rem] h-1.5" aria-hidden>
                <div className="h-full rounded-full bg-whatsapp-700" style={{ width: `max(3px, ${(d.numeros / maior) * 100}%)` }} />
              </div>
            </li>
          ))}
        </ol>

        {ordenados.length > NO_RANKING && (
          <button
            type="button"
            onClick={() => setTodos(!todos)}
            aria-expanded={todos}
            className={classesBotao({ variante: 'fantasma', tamanho: 'sm', className: 'mt-2' })}
          >
            <ChevronDown className={cn('transition-transform', todos && 'rotate-180')} />
            {todos ? `Mostrar só os ${NO_RANKING} maiores` : `Ver todos os ${ordenados.length} DDDs`}
          </button>
        )}
        {semDdd > 0 && (
          <p className="mt-3 px-2 text-[12px] text-sutil">
            {formatarNumero(semDdd)} número(s) sem DDD do Brasil (estrangeiros ou inválidos) ficam fora do mapa.
          </p>
        )}
      </div>
    </div>
  )
}
