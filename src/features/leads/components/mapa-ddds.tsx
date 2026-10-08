'use client'

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'

import { formatarNumero, formatarPorcentagem, plural } from '@/lib/format'
import { useLargura } from '@/lib/use-largura'
import { cn } from '@/lib/utils'

import { POSICAO_DO_DDD, REGIAO_DO_DDD } from '../ddd'
import { ESTADOS_DO_MAPA, MAPA_BRASIL, projetar } from '../mapa-brasil'

type Caixa = readonly [x: number, y: number, largura: number, altura: number]
type Visao = 'brasil' | 'sudeste'

/** Raio da maior bolha e o mínimo (para os DDDs pequenos continuarem visíveis), em unidades do mapa inteiro. */
const RAIO_MAX = 52
const RAIO_MIN = 4.5
/** O número do DDD vai dentro da bolha a partir deste raio na tela (px). */
const RAIO_COM_ROTULO = 14

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact' })

/** Raio pela área (o dobro de números = o dobro da área), relativo ao maior DDD. */
const raioDe = (numeros: number, maior: number) => Math.max(RAIO_MIN, RAIO_MAX * Math.sqrt(numeros / maior))

// O recorte "Sudeste e Sul" tem a mesma proporção do Brasil inteiro: a moldura do mapa não muda de tamanho.
const [SUL_X, SUL_Y] = projetar(-53.6, -16.6)
const SUL_LARGURA = projetar(-40.6, -16.6)[0] - SUL_X
const VISOES: Record<Visao, { rotulo: string; caixa: Caixa }> = {
  brasil: { rotulo: 'Brasil', caixa: [0, 0, MAPA_BRASIL.largura, MAPA_BRASIL.altura] },
  sudeste: { rotulo: 'Sudeste e Sul', caixa: [SUL_X, SUL_Y, SUL_LARGURA, (SUL_LARGURA * MAPA_BRASIL.altura) / MAPA_BRASIL.largura] },
}

/** Caixa visível do mapa, indo suavemente até `alvo` (de uma vez para quem pediu menos movimento). */
function useCaixaAnimada(alvo: Caixa) {
  const [caixa, setCaixa] = useState(alvo)
  const atual = useRef(alvo)
  useEffect(() => {
    const de = atual.current
    const duracao = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450
    const inicio = performance.now()
    let quadro = 0
    const passo = (agora: number) => {
      const t = duracao ? Math.min(1, (agora - inicio) / duracao) : 1
      const suave = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
      const proxima = de.map((v, i) => v + (alvo[i] - v) * suave) as unknown as Caixa
      atual.current = proxima
      setCaixa(proxima)
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [alvo])
  return caixa
}

/**
 * Mapa do Brasil com uma bolha por DDD na cidade principal (área proporcional aos números).
 * Mouse ou toque mostram o DDD; `ativo`/`aoAtivar` ligam o mapa ao ranking ao lado.
 * O recorte "Sudeste e Sul" separa os DDDs de São Paulo, que no Brasil inteiro ficam colados.
 */
export function MapaDdds({
  porDdd,
  total,
  ativo,
  aoAtivar,
}: {
  porDdd: Array<{ ddd: string; numeros: number }>
  /** Base do "% do total" (todos os números com WhatsApp). */
  total: number
  ativo: string | null
  aoAtivar: (ddd: string | null) => void
}) {
  const [visao, setVisao] = useState<Visao>('brasil')
  const caixa = useCaixaAnimada(VISOES[visao].caixa)
  const moldura = useRef<HTMLDivElement>(null)
  const largura = useLargura(moldura)

  const maior = Math.max(0, ...porDdd.map((d) => d.numeros))
  // Maiores primeiro: as pequenas ficam por cima e continuam visíveis.
  const bolhas = useMemo(
    () =>
      porDdd
        .filter((d) => d.numeros > 0 && POSICAO_DO_DDD[d.ddd])
        .map((d) => {
          const [x, y] = projetar(...POSICAO_DO_DDD[d.ddd])
          return { ...d, x, y, r: raioDe(d.numeros, maior) }
        })
        .sort((a, b) => b.r - a.r),
    [porDdd, maior],
  )

  const [cx, cy, cw, ch] = caixa
  // As bolhas têm o mesmo tamanho na tela em qualquer recorte: no mapa, o raio é r / zoom.
  const zoom = MAPA_BRASIL.largura / cw
  const pxPorUnidade = largura / cw
  const pxPorRaio = largura / MAPA_BRASIL.largura

  // Número dentro da bolha só quando cabe e nenhuma bolha menor (desenhada por cima) cobre o centro.
  const rotuladas = bolhas.filter(
    (b, i) =>
      b.r * pxPorRaio >= RAIO_COM_ROTULO &&
      bolhas.slice(i + 1).every((o) => Math.hypot(o.x - b.x, o.y - b.y) * pxPorUnidade > o.r * pxPorRaio + 9),
  )

  function apontar(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const escala = rect.width / cw
    if (!escala) return
    const x = cx + (e.clientX - rect.left) / escala
    const y = cy + (e.clientY - rect.top) / escala
    // Dentro de bolhas sobrepostas vale a menor (a de cima); fora, a borda mais próxima até 10 px.
    let achada: string | null = null
    let melhor = Infinity
    for (const b of bolhas) {
      const folga = (Math.hypot(b.x - x, b.y - y) - b.r / zoom) * escala
      const nota = folga <= 0 ? b.r - 1e6 : folga
      if (folga <= 10 && nota < melhor) {
        melhor = nota
        achada = b.ddd
      }
    }
    if (achada !== ativo) aoAtivar(achada)
  }

  const destaque = bolhas.find((b) => b.ddd === ativo)
  const dica = destaque && destaque.x >= cx && destaque.x <= cx + cw && destaque.y >= cy && destaque.y <= cy + ch ? destaque : null
  let posicaoDica: { left: string; top: string; transform: string } | null = null
  if (dica) {
    const raio = dica.r / zoom
    const esquerda = ((dica.x - cx) / cw) * 100
    const acima = (dica.y - raio - cy) / ch > 0.16
    const topo = (((acima ? dica.y - raio : dica.y + raio) - cy) / ch) * 100
    const tx = esquerda < 22 ? '-12%' : esquerda > 78 ? '-88%' : '-50%'
    posicaoDica = { left: `${esquerda}%`, top: `${topo}%`, transform: `translate(${tx}, ${acima ? 'calc(-100% - 8px)' : '8px'})` }
  }

  const potencia = maior > 0 ? 10 ** Math.floor(Math.log10(maior)) : 0
  const referencias = [potencia, potencia / 10, potencia / 100].filter((v) => v >= 10)
  const primeiro = bolhas.length ? bolhas[0] : null

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="inline-flex rounded-lg bg-ink/[0.06] p-0.5" role="group" aria-label="Recorte do mapa">
          {(Object.keys(VISOES) as Visao[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visao === v}
              onClick={() => setVisao(v)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors',
                visao === v ? 'bg-superficie text-ink shadow-sm' : 'text-suave hover:text-ink',
              )}
            >
              {VISOES[v].rotulo}
            </button>
          ))}
        </div>

        {/* Legenda de tamanho: bolhas de referência no mesmo tamanho das do mapa. */}
        {pxPorRaio > 0 && referencias.length > 0 && (
          <div className="flex items-end gap-3" aria-hidden>
            {referencias.map((v) => {
              const r = raioDe(v, maior) * pxPorRaio
              return (
                <div key={v} className="flex flex-col items-center gap-1">
                  <svg width={2 * r + 2} height={2 * r + 2} className="overflow-visible">
                    <circle cx={r + 1} cy={r + 1} r={r} fill="var(--color-whatsapp-700)" fillOpacity={0.78} />
                  </svg>
                  <span className="tipo-dado text-[11px] leading-none text-suave">{compacto.format(v)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div ref={moldura} className="relative" style={{ aspectRatio: `${MAPA_BRASIL.largura} / ${MAPA_BRASIL.altura}` }}>
        <svg
          viewBox={caixa.join(' ')}
          className="absolute inset-0 size-full touch-manipulation"
          role="img"
          aria-label={
            primeiro
              ? `Mapa do Brasil com os números por DDD. O maior é o DDD ${primeiro.ddd} (${REGIAO_DO_DDD[primeiro.ddd]}), com ${formatarNumero(primeiro.numeros)}.`
              : 'Mapa do Brasil'
          }
          onPointerMove={apontar}
          onPointerDown={apontar}
          // No toque o "leave" vem logo ao soltar o dedo: a dica fica até tocar em outro lugar.
          onPointerLeave={(e) => e.pointerType !== 'touch' && aoAtivar(null)}
        >
          {ESTADOS_DO_MAPA.map((e) => (
            <path
              key={e.uf}
              d={e.d}
              fill="var(--color-papel)"
              stroke="var(--color-linha-forte)"
              strokeWidth={1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {bolhas.map((b) => (
            <circle
              key={b.ddd}
              cx={b.x}
              cy={b.y}
              r={b.r / zoom}
              fill="var(--color-whatsapp-700)"
              fillOpacity={ativo ? (b.ddd === ativo ? 0.95 : 0.28) : 0.78}
              stroke="var(--color-superficie)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              className="transition-[fill-opacity] duration-150"
            />
          ))}
          {/* Contorno da bolha em destaque por cima de todas (a do 11 fica embaixo das vizinhas). */}
          {destaque && (
            <circle
              cx={destaque.x}
              cy={destaque.y}
              r={destaque.r / zoom}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {pxPorUnidade > 0 && (
            <g className="pointer-events-none font-mono select-none" fontWeight={700} textAnchor="middle" fill="white">
              {rotuladas.map((b) => (
                <text key={b.ddd} x={b.x} y={b.y} dy="0.35em" fontSize={11 / pxPorUnidade}>
                  {b.ddd}
                </text>
              ))}
            </g>
          )}
        </svg>

        {dica && posicaoDica && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-linha bg-superficie px-3 py-2 whitespace-nowrap shadow-flutuante"
            style={posicaoDica}
          >
            <p className="tipo-dado text-[14px] font-semibold text-ink">{plural(dica.numeros, 'número')}</p>
            <p className="text-[12px] leading-4 text-suave">
              DDD {dica.ddd} · {REGIAO_DO_DDD[dica.ddd]}
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-suave">{formatarPorcentagem(total ? dica.numeros / total : 0)} do total</p>
          </div>
        )}
      </div>
    </div>
  )
}
