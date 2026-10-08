'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { formatarMoeda, formatarNumero } from '@/lib/format'
import { useLargura } from '@/lib/use-largura'
import { cn } from '@/lib/utils'

import type { Granularidade, PontoSerie } from '../serie'

type SerieCanal = { id: string; nome: string; cor: string }
type Medida = 'valor' | 'pedidos'

const ALTURA_PLOT = 220
const TOPO = 14
const BASE = 28
const ESQUERDA = 68
const DIREITA_COMPACTA = 16
const DIREITA_COM_ROTULOS = 112

const moedaCurta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })

/** Teto e marcas "redondas" do eixo Y (0, 500, 1.000...). */
function escala(max: number, inteiro: boolean) {
  if (max <= 0) return { teto: inteiro ? 4 : 1000, marcas: inteiro ? [0, 1, 2, 3, 4] : [0, 250, 500, 750, 1000] }
  const bruto = max / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  let passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto
  if (inteiro) passo = Math.max(1, Math.ceil(passo))
  const teto = Math.ceil(max / passo) * passo
  return { teto, marcas: Array.from({ length: Math.round(teto / passo) + 1 }, (_, i) => i * passo) }
}

/**
 * Evolução das vendas no período, uma linha por canal (por dia ou por semana).
 * Linha-guia com tooltip de todos os canais no ponto (mouse, toque ou setas do
 * teclado), legenda sempre visível e tabela com os mesmos números.
 */
export function GraficoEvolucao({
  pontos,
  canais,
  granularidade,
}: {
  pontos: PontoSerie[]
  canais: SerieCanal[]
  granularidade: Granularidade
}) {
  const [medida, setMedida] = useState<Medida>('valor')
  const [indice, setIndice] = useState<number | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const largura = useLargura(caixa)

  const valorDe = (p: PontoSerie, id: string) => p.valores[id as keyof PontoSerie['valores']]?.[medida] ?? 0
  const totalDe = (p: PontoSerie) => canais.reduce((s, c) => s + valorDe(p, c.id), 0)
  const max = Math.max(0, ...pontos.flatMap((p) => canais.map((c) => valorDe(p, c.id))))
  const { teto, marcas } = escala(max, medida === 'pedidos')
  const y = (v: number) => TOPO + ALTURA_PLOT - (v / teto) * ALTURA_PLOT
  const eixo = (v: number) => (medida === 'valor' ? moedaCurta.format(v) : formatarNumero(v))
  const valorCompleto = (v: number) => (medida === 'valor' ? formatarMoeda(v) : `${formatarNumero(v)} pedido(s)`)

  // Rótulos no fim das linhas só quando há espaço e eles não se sobrepõem (senão: legenda + tooltip).
  const ultimo = pontos.at(-1)
  const finais = ultimo ? canais.map((c) => ({ ...c, y: y(valorDe(ultimo, c.id)) })).sort((a, b) => a.y - b.y) : []
  const rotulosNoFim = largura >= 640 && canais.length > 1 && finais.every((f, i) => i === 0 || f.y - finais[i - 1].y >= 15)
  const direita = rotulosNoFim ? DIREITA_COM_ROTULOS : DIREITA_COMPACTA

  const larguraPlot = Math.max(1, largura - ESQUERDA - direita)
  const x = (i: number) => ESQUERDA + (pontos.length === 1 ? larguraPlot / 2 : (i / (pontos.length - 1)) * larguraPlot)
  const alturaSvg = TOPO + ALTURA_PLOT + BASE
  // Rótulos do eixo X: um a cada `passo` pontos; o último ponto sempre rotulado (sem amontoar).
  const passoRotulo = Math.max(1, Math.ceil(pontos.length / Math.max(2, Math.floor(larguraPlot / 72))))
  const indicesRotulo = pontos.map((_, i) => i).filter((i) => i % passoRotulo === 0)
  const ultimoIndice = pontos.length - 1
  if (pontos.length > 0 && indicesRotulo.at(-1) !== ultimoIndice) {
    if (ultimoIndice - indicesRotulo.at(-1)! < passoRotulo / 2) indicesRotulo.pop()
    indicesRotulo.push(ultimoIndice)
  }
  const rotuloEixo = (p: PontoSerie) => p.rotulo.split(' – ')[0]

  const aoMover = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const relativo = (e.clientX - r.left - ESQUERDA) / larguraPlot
    setIndice(Math.min(pontos.length - 1, Math.max(0, Math.round(relativo * (pontos.length - 1)))))
  }
  const aoTeclar = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const atual = indice ?? (e.key === 'ArrowLeft' ? pontos.length : -1)
    setIndice(Math.min(pontos.length - 1, Math.max(0, atual + (e.key === 'ArrowRight' ? 1 : -1))))
  }

  const pontoAtivo = indice !== null ? pontos[indice] : null
  const xAtivo = indice !== null ? x(indice) : 0
  const tooltipNaDireita = xAtivo < largura / 2

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legenda">
          {canais.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <span className="h-0.5 w-4 rounded-full" style={{ background: c.cor }} aria-hidden />
              {c.nome}
            </li>
          ))}
        </ul>
        <div className="flex rounded-lg border border-linha bg-papel p-0.5" role="group" aria-label="Medida do gráfico">
          {(
            [
              ['valor', 'Faturamento'],
              ['pedidos', 'Pedidos'],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              onClick={() => setMedida(chave)}
              aria-pressed={medida === chave}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors',
                medida === chave ? 'bg-superficie text-ink shadow-cartao ring-1 ring-linha' : 'text-suave hover:text-ink',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div ref={caixa} className="relative w-full" style={{ height: alturaSvg }}>
        {largura > 0 && (
          <svg
            width={largura}
            height={alturaSvg}
            className="block touch-pan-y outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ink"
            tabIndex={0}
            role="img"
            aria-label={`Evolução ${medida === 'valor' ? 'do faturamento' : 'dos pedidos'} por canal, ${granularidade === 'semana' ? 'por semana' : 'por dia'}. Use as setas para ver cada ponto.`}
            onPointerMove={aoMover}
            onPointerDown={aoMover}
            onPointerLeave={() => setIndice(null)}
            onKeyDown={aoTeclar}
            onBlur={() => setIndice(null)}
          >
            {/* Grade e eixo Y */}
            {marcas.map((m) => (
              <g key={m}>
                <line x1={ESQUERDA} x2={ESQUERDA + larguraPlot} y1={y(m)} y2={y(m)} stroke="var(--color-linha)" strokeWidth={1} />
                <text x={ESQUERDA - 10} y={y(m)} dy="0.32em" textAnchor="end" className="fill-[var(--color-suave)] text-[11px] tabular-nums">
                  {eixo(m)}
                </text>
              </g>
            ))}

            {/* Eixo X */}
            {indicesRotulo.map((i) => (
              <text
                key={pontos[i].inicio}
                x={x(i)}
                y={TOPO + ALTURA_PLOT + 18}
                textAnchor={i === 0 ? 'start' : i === ultimoIndice ? 'end' : 'middle'}
                className="fill-[var(--color-suave)] text-[11px] tabular-nums"
              >
                {rotuloEixo(pontos[i])}
              </text>
            ))}

            {/* Linhas */}
            {canais.map((c) => (
              <polyline
                key={c.id}
                fill="none"
                stroke={c.cor}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={pontos.map((p, i) => `${x(i).toFixed(1)},${y(valorDe(p, c.id)).toFixed(1)}`).join(' ')}
                opacity={pontoAtivo ? 0.9 : 1}
              />
            ))}

            {/* Ponto final de cada linha (+ rótulo quando cabe) */}
            {ultimo &&
              canais.map((c) => (
                <circle key={c.id} cx={x(pontos.length - 1)} cy={y(valorDe(ultimo, c.id))} r={4} fill={c.cor} stroke="var(--color-superficie)" strokeWidth={2} />
              ))}
            {rotulosNoFim &&
              finais.map((f) => (
                <text key={f.id} x={x(pontos.length - 1) + 10} y={f.y} dy="0.32em" className="fill-[var(--color-ink)] text-[12px] font-medium">
                  {f.nome}
                </text>
              ))}

            {/* Linha-guia do ponto ativo */}
            {pontoAtivo && (
              <g>
                <line x1={xAtivo} x2={xAtivo} y1={TOPO} y2={TOPO + ALTURA_PLOT} stroke="var(--color-linha-forte)" strokeWidth={1} />
                {canais.map((c) => (
                  <circle key={c.id} cx={xAtivo} cy={y(valorDe(pontoAtivo, c.id))} r={4.5} fill={c.cor} stroke="var(--color-superficie)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}

        {max === 0 && largura > 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-[40%] text-center text-[13px] text-suave">Nenhuma venda no período.</p>
        )}

        {pontoAtivo && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 min-w-48 rounded-lg border border-linha bg-superficie px-3 py-2 shadow-lg"
            style={{ top: TOPO, left: tooltipNaDireita ? xAtivo + 12 : undefined, right: tooltipNaDireita ? undefined : largura - xAtivo + 12 }}
          >
            <p className="mb-1.5 text-[12px] font-semibold text-suave">
              {granularidade === 'semana' ? `Semana ${pontoAtivo.rotulo}` : pontoAtivo.rotulo}
            </p>
            <ul className="space-y-1">
              {[...canais]
                .sort((a, b) => valorDe(pontoAtivo, b.id) - valorDe(pontoAtivo, a.id))
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-[12px] text-suave">
                      <span className="h-0.5 w-3 rounded-full" style={{ background: c.cor }} aria-hidden />
                      {c.nome}
                    </span>
                    <span className="tipo-dado text-[13px] font-semibold text-ink">{valorCompleto(valorDe(pontoAtivo, c.id))}</span>
                  </li>
                ))}
            </ul>
            {canais.length > 1 && (
              <p className="mt-1.5 flex justify-between gap-4 border-t border-linha pt-1.5 text-[12px] text-suave">
                Total <span className="tipo-dado font-semibold text-ink">{valorCompleto(totalDe(pontoAtivo))}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer font-semibold text-suave hover:text-ink">Ver os números em tabela</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-linha">
          <table className="w-full min-w-[480px] text-left">
            <thead className="sticky top-0 bg-papel">
              <tr>
                <th className="px-3 py-2 font-semibold">{granularidade === 'semana' ? 'Semana' : 'Dia'}</th>
                {canais.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-right font-semibold">
                    {c.nome}
                  </th>
                ))}
                {canais.length > 1 && <th className="px-3 py-2 text-right font-semibold">Total</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {pontos.map((p) => (
                <tr key={p.inicio}>
                  <td className="tipo-dado px-3 py-1.5 whitespace-nowrap">{p.rotulo}</td>
                  {canais.map((c) => (
                    <td key={c.id} className="tipo-dado px-3 py-1.5 text-right whitespace-nowrap">
                      {valorCompleto(valorDe(p, c.id))}
                    </td>
                  ))}
                  {canais.length > 1 && (
                    <td className="tipo-dado px-3 py-1.5 text-right font-semibold whitespace-nowrap">{valorCompleto(totalDe(p))}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
