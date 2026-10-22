'use client'

import { useMemo } from 'react'

import { formatarNumero, formatarPorcentagem, plural } from '@/lib/format'
import { cn } from '@/lib/utils'

import { NOME_DA_UF, ufDoDdd } from '../ddd'
import { ESTADOS_DO_MAPA, MAPA_BRASIL } from '../mapa-brasil'

/**
 * Faixas da fatia de cada estado no total. Fixas (e não proporcionais ao maior)
 * porque São Paulo concentra a maior parte dos números: numa escala contínua o
 * resto do país ficaria todo branco. `tom` = quanto do verde entra na mistura.
 */
const FAIXAS = [
  { ate: 0.002, rotulo: 'até 0,2%', tom: 16 },
  { ate: 0.005, rotulo: '0,2–0,5%', tom: 34 },
  { ate: 0.01, rotulo: '0,5–1%', tom: 54 },
  { ate: 0.05, rotulo: '1–5%', tom: 76 },
  { ate: Infinity, rotulo: '5% ou mais', tom: 100 },
] as const

/** Verde da faixa misturado à superfície: claro → escuro no tema claro e escuro → vivo no escuro. */
const corDoTom = (tom: number) => `color-mix(in oklab, var(--color-whatsapp-700) ${tom}%, var(--color-superficie))`
const SEM_NUMEROS = 'var(--color-linha)'

/** Caixa de cada estado no mapa (para posicionar a dica), lida dos próprios caminhos (só M/L absolutos). */
const CAIXA_DA_UF = Object.fromEntries(
  ESTADOS_DO_MAPA.map((e) => {
    const n = (e.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    const xs = n.filter((_, i) => i % 2 === 0)
    const ys = n.filter((_, i) => i % 2 === 1)
    return [e.uf, { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }]
  }),
)

/**
 * Mapa do Brasil com cada estado pintado pela fatia dos números (DDDs somados pela
 * UF da cidade principal). Mouse ou toque mostram o estado e os DDDs dele;
 * `ufAtiva`/`aoAtivarUf` ligam o mapa ao ranking ao lado.
 */
export function MapaDdds({
  porDdd,
  total,
  ufAtiva,
  aoAtivarUf,
}: {
  porDdd: Array<{ ddd: string; numeros: number }>
  /** Base do "% do total" (todos os números com WhatsApp). */
  total: number
  ufAtiva: string | null
  aoAtivarUf: (uf: string | null) => void
}) {
  const estados = useMemo(() => {
    const porUf = new Map<string, { numeros: number; ddds: Array<{ ddd: string; numeros: number }> }>()
    for (const d of porDdd) {
      const uf = ufDoDdd(d.ddd)
      if (!uf || d.numeros <= 0) continue
      const estado = porUf.get(uf) ?? { numeros: 0, ddds: [] }
      estado.numeros += d.numeros
      estado.ddds.push(d)
      porUf.set(uf, estado)
    }
    for (const e of porUf.values()) e.ddds.sort((a, b) => b.numeros - a.numeros)
    return porUf
  }, [porDdd])

  const faixaDe = (numeros: number) => FAIXAS.find((f) => numeros / (total || 1) < f.ate) ?? FAIXAS[FAIXAS.length - 1]
  const corDe = (uf: string) => {
    const numeros = estados.get(uf)?.numeros ?? 0
    return numeros > 0 ? corDoTom(faixaDe(numeros).tom) : SEM_NUMEROS
  }

  const maior = [...estados].sort((a, b) => b[1].numeros - a[1].numeros)[0]
  const ativo = ufAtiva ? ESTADOS_DO_MAPA.find((e) => e.uf === ufAtiva) : undefined
  const dica = ufAtiva ? { uf: ufAtiva, ...(estados.get(ufAtiva) ?? { numeros: 0, ddds: [] }) } : null

  let posicaoDica: { left: string; top: string; transform: string } | null = null
  if (dica && CAIXA_DA_UF[dica.uf]) {
    const c = CAIXA_DA_UF[dica.uf]
    const esquerda = ((c.x0 + c.x1) / 2 / MAPA_BRASIL.largura) * 100
    const acima = c.y0 / MAPA_BRASIL.altura > 0.18
    const topo = ((acima ? c.y0 : c.y1) / MAPA_BRASIL.altura) * 100
    const tx = esquerda < 22 ? '-12%' : esquerda > 78 ? '-88%' : '-50%'
    posicaoDica = { left: `${esquerda}%`, top: `${topo}%`, transform: `translate(${tx}, ${acima ? 'calc(-100% - 6px)' : '6px'})` }
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-hidden>
        <span className="text-[12px] font-semibold text-ink">Fatia dos números</span>
        {FAIXAS.map((f) => (
          <span key={f.rotulo} className="inline-flex items-center gap-1.5 text-[12px] text-suave">
            <span className="size-3 rounded-[3px]" style={{ background: corDoTom(f.tom) }} />
            {f.rotulo}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-suave">
          <span className="size-3 rounded-[3px]" style={{ background: SEM_NUMEROS }} />
          sem números
        </span>
      </div>

      <div className="relative" style={{ aspectRatio: `${MAPA_BRASIL.largura} / ${MAPA_BRASIL.altura}` }}>
        <svg
          viewBox={`0 0 ${MAPA_BRASIL.largura} ${MAPA_BRASIL.altura}`}
          className="absolute inset-0 size-full touch-manipulation"
          role="img"
          aria-label={
            maior
              ? `Mapa do Brasil com os números por estado. O maior é ${NOME_DA_UF[maior[0]]}, com ${formatarNumero(maior[1].numeros)} (${formatarPorcentagem(maior[1].numeros / (total || 1))}).`
              : 'Mapa do Brasil'
          }
          // No toque o "leave" vem logo ao soltar o dedo: a dica fica até tocar fora do mapa.
          onPointerLeave={(e) => e.pointerType !== 'touch' && aoAtivarUf(null)}
          onPointerDown={(e) => e.target === e.currentTarget && aoAtivarUf(null)}
        >
          {ESTADOS_DO_MAPA.map((e) => (
            <path
              key={e.uf}
              d={e.d}
              fill={corDe(e.uf)}
              fillOpacity={ufAtiva && ufAtiva !== e.uf ? 0.55 : 1}
              stroke="var(--color-superficie)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="cursor-default transition-[fill-opacity] duration-150"
              onPointerEnter={() => aoAtivarUf(e.uf)}
              onPointerDown={() => aoAtivarUf(e.uf)}
            />
          ))}
          {/* Contorno do estado em destaque por cima dos vizinhos. */}
          {ativo && (
            <path
              d={ativo.d}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </svg>

        {dica && posicaoDica && (
          <div
            className="pointer-events-none absolute z-10 max-w-64 rounded-lg border border-linha bg-superficie px-3 py-2 shadow-flutuante"
            style={posicaoDica}
          >
            <p className="text-[13px] font-semibold whitespace-nowrap text-ink">
              {NOME_DA_UF[dica.uf]} <span className="font-normal text-suave">· {dica.uf}</span>
            </p>
            {dica.numeros > 0 ? (
              <>
                <p className="tipo-dado mt-0.5 text-[14px] font-semibold whitespace-nowrap text-ink">{plural(dica.numeros, 'número')}</p>
                <p className="text-[12px] leading-4 whitespace-nowrap text-suave">
                  {formatarPorcentagem(dica.numeros / (total || 1))} do total · {plural(dica.ddds.length, 'DDD')}
                </p>
                <p className={cn('tipo-dado mt-1 text-[12px] leading-4 text-suave', dica.ddds.length > 4 && 'whitespace-nowrap')}>
                  {dica.ddds
                    .slice(0, 4)
                    .map((d) => `${d.ddd}: ${formatarNumero(d.numeros)}`)
                    .join(' · ')}
                  {dica.ddds.length > 4 && ' …'}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-suave">sem números</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
