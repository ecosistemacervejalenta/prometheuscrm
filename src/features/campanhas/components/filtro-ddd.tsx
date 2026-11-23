'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'

import { Checkbox } from '@/components/form/fields'
import { REGIAO_DO_DDD } from '@/features/leads/ddd'
import { formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Com mais DDDs que isso, mostra só os maiores (e os marcados) até a pessoa pedir todos. */
const LIMITE_VISIVEIS = 16
const MAIORES = 12

/** "DDD 11", "DDDs 11 e 21", "DDDs 11, 12, 13, 14, 15 e mais 3" (cabe na descrição da campanha). */
export function descreverDdds(ddds: string[]): string {
  if (ddds.length === 0) return ''
  if (ddds.length === 1) return `DDD ${ddds[0]}`
  if (ddds.length > 6) return `DDDs ${ddds.slice(0, 5).join(', ')} e mais ${ddds.length - 5}`
  return `DDDs ${ddds.slice(0, -1).join(', ')} e ${ddds[ddds.length - 1]}`
}

/**
 * "Só alguns DDDs" das listas escolhidas: a pessoa marca um ou mais DDDs e a campanha vai só
 * para esses números. `contagem` vem do que cada lista guarda por DDD (em ordem de DDD) — quem
 * está em duas listas conta duas vezes aqui; o total sem repetir vem do banco, logo abaixo.
 */
export function FiltroDdd({
  contagem,
  ativo,
  aoAtivar,
  marcados,
  aoMarcar,
}: {
  contagem: Array<{ ddd: string; numeros: number }>
  ativo: boolean
  aoAtivar: (ativo: boolean) => void
  marcados: string[]
  aoMarcar: (ddds: string[]) => void
}) {
  const [todos, setTodos] = useState(false)
  const recolher = !todos && contagem.length > LIMITE_VISIVEIS
  const maiores = new Set(
    [...contagem]
      .sort((a, b) => b.numeros - a.numeros)
      .slice(0, MAIORES)
      .map((d) => d.ddd),
  )
  const visiveis = recolher ? contagem.filter((d) => maiores.has(d.ddd) || marcados.includes(d.ddd)) : contagem
  const escolhidos = contagem.filter((d) => marcados.includes(d.ddd))

  function alternar(ddd: string) {
    aoMarcar(marcados.includes(ddd) ? marcados.filter((d) => d !== ddd) : [...marcados, ddd].sort())
  }

  return (
    <div className="space-y-3 rounded-xl border border-linha p-3.5">
      <Checkbox
        label="Só alguns DDDs"
        descricao="Envia só para os números dos DDDs que você marcar — ex.: só o 11 (São Paulo)."
        checked={ativo}
        onChange={(e) => aoAtivar(e.target.checked)}
      />
      {ativo && (
        <div className="space-y-2.5 sm:pl-[30px]">
          <div role="group" aria-label="DDDs para enviar" className="flex flex-wrap gap-1.5">
            {visiveis.map((d) => {
              const marcado = marcados.includes(d.ddd)
              return (
                <button
                  key={d.ddd}
                  type="button"
                  aria-pressed={marcado}
                  aria-label={`DDD ${d.ddd}, ${REGIAO_DO_DDD[d.ddd] ?? ''}, ${formatarNumero(d.numeros)} números`}
                  title={REGIAO_DO_DDD[d.ddd]}
                  onClick={() => alternar(d.ddd)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors',
                    marcado ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie text-ink hover:border-linha-forte',
                  )}
                >
                  {marcado && <Check className="size-3.5" aria-hidden />}
                  <span className="tipo-dado font-semibold">{d.ddd}</span>
                  <span className={cn('tipo-dado text-[12px]', marcado ? 'text-white/70' : 'text-suave')}>{formatarNumero(d.numeros)}</span>
                </button>
              )
            })}
            {contagem.length > LIMITE_VISIVEIS && (
              <button
                type="button"
                onClick={() => setTodos(!todos)}
                className="h-9 rounded-lg px-2.5 text-[13px] font-semibold text-volt-700 hover:text-ink"
              >
                {todos ? 'Mostrar só os maiores' : `Ver todos os ${contagem.length} DDDs`}
              </button>
            )}
          </div>
          <p className="text-[13px] text-suave" aria-live="polite">
            {escolhidos.length === 0 ? (
              'Marque um ou mais DDDs (ao lado de cada um, quantos contatos as listas têm nele).'
            ) : (
              <>
                {escolhidos.length <= 3
                  ? escolhidos.map((d) => `${d.ddd} · ${REGIAO_DO_DDD[d.ddd] ?? ''}`).join(', ')
                  : `${escolhidos.length} DDDs marcados`}
                {' · '}
                <button type="button" onClick={() => aoMarcar([])} className="font-semibold text-volt-700 hover:text-ink">
                  Desmarcar
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
