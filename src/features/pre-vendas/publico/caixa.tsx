import { PackageOpen, Truck } from 'lucide-react'
import type { ReactNode } from 'react'

import { formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { GrupoDaCaixa } from './caixa-dados'

/**
 * Caixa VIP desenhada (SVG, cores da marca):
 *   aberta  → garrafas dentro e o número de cervejas no selo (o cliente ainda está montando);
 *   fechada → tampa com laço e coração: a caixa que vai ser enviada com carinho.
 * `animar` faz as garrafas caírem dentro da caixa (ao entrar cerveja nova).
 */
export function CaixaIlustracao({
  estado,
  quantidade,
  animar = false,
  movimento = false,
  className,
}: {
  estado: 'aberta' | 'fechada'
  quantidade?: number
  animar?: boolean
  /** Linhas de velocidade: a caixa a caminho. */
  movimento?: boolean
  className?: string
}) {
  const titulo = estado === 'aberta' ? `Caixa VIP aberta${quantidade ? ` com ${quantidade} cervejas` : ''}` : 'Caixa VIP fechada, pronta para envio'
  return (
    <svg viewBox="0 0 240 212" role="img" aria-label={titulo} className={cn('mx-auto block h-auto w-full max-w-[240px]', className)}>
      <ellipse cx="120" cy="200" rx="88" ry="8" className="fill-ink/10" />

      {movimento && (
        <g className="fill-ink/20">
          <rect x="0" y="120" width="26" height="6" rx="3" />
          <rect x="8" y="140" width="22" height="6" rx="3" />
          <rect x="2" y="160" width="28" height="6" rx="3" />
        </g>
      )}

      <g className={estado === 'aberta' && !animar ? 'animar-flutuar' : undefined}>
        {estado === 'aberta' ? (
          <>
            {/* aba de trás e interior */}
            <path d="M62 86 L70 50 H170 L178 86 Z" className="fill-vip-700/60" />
            <path d="M40 100 L62 86 H178 L200 100 Z" className="fill-vip-700" />

            {/* garrafas */}
            <Garrafa x={90} y={34} giro={-9} atraso={0} animar={animar} />
            <Garrafa x={150} y={36} giro={9} atraso={0.12} animar={animar} />
            <Garrafa x={120} y={20} giro={0} atraso={0.24} animar={animar} />

            {/* frente e abas abertas */}
            <rect x="40" y="100" width="160" height="92" rx="6" className="fill-vip" />
            <path d="M40 100 L62 86 L46 60 L18 78 Z" className="fill-vip" />
            <path d="M200 100 L178 86 L194 60 L222 78 Z" className="fill-vip" />
            <path d="M40 100 L62 86 M200 100 L178 86" className="stroke-vip-700/50" strokeWidth="2" />
          </>
        ) : (
          <>
            {/* tampa fechada com laço */}
            <rect x="40" y="100" width="160" height="92" rx="6" className="fill-vip" />
            <path d="M40 100 L60 82 H180 L200 100 Z" className="fill-vip" />
            <path d="M40 100 L60 82 H180 L200 100 Z" className="fill-white/25" />
            <path d="M40 100 H200" className="stroke-vip-700/50" strokeWidth="2" />
            <path d="M112 82 H128 L131 100 H109 Z" className="fill-volt" />
            <ellipse cx="106" cy="76" rx="15" ry="8" transform="rotate(-18 106 76)" className="fill-volt" />
            <ellipse cx="134" cy="76" rx="15" ry="8" transform="rotate(18 134 76)" className="fill-volt" />
            <circle cx="120" cy="80" r="6" className="fill-volt-700" />
          </>
        )}

        {/* etiqueta */}
        <rect x="66" y="122" width="108" height="46" rx="8" className="fill-white" />
        <text x="120" y="141" textAnchor="middle" fontSize="8.5" fontWeight="700" letterSpacing="1.1" className="fill-vip-700">
          CERVEJA LENTA
        </text>
        <text x="120" y="159" textAnchor="middle" fontSize="16" fontWeight="800" className="fill-ink">
          CAIXA VIP
        </text>

        {estado === 'aberta' && quantidade ? (
          <g>
            <circle cx="198" cy="112" r="18" className="fill-ink" />
            <text x="198" y="118" textAnchor="middle" fontSize={quantidade > 99 ? 12 : 16} fontWeight="800" className="fill-volt">
              {quantidade}
            </text>
          </g>
        ) : null}
        {estado === 'fechada' && (
          <path
            d="M198 128c-3-5-12-4-12 3 0 6 8 11 12 14 4-3 12-8 12-14 0-7-9-8-12-3z"
            className="fill-perigo"
            transform="translate(0 -14)"
          />
        )}
      </g>
    </svg>
  )
}

function Garrafa({ x, y, giro, atraso, animar }: { x: number; y: number; giro: number; atraso: number; animar: boolean }) {
  return (
    <g className={animar ? 'animar-cair' : undefined} style={animar ? { animationDelay: `${atraso}s` } : undefined}>
      <g transform={`rotate(${giro} ${x} ${y + 60})`}>
        <rect x={x - 5.5} y={y} width="11" height="6" rx="1.5" className="fill-vip" />
        <rect x={x - 4.5} y={y + 5} width="9" height="20" className="fill-ink" />
        <path
          d={`M${x - 4.5} ${y + 25} C${x - 4.5} ${y + 32} ${x - 11} ${y + 33} ${x - 11} ${y + 42} V${y + 100} H${x + 11} V${y + 42} C${x + 11} ${y + 33} ${x + 4.5} ${y + 32} ${x + 4.5} ${y + 25} Z`}
          className="fill-ink"
        />
        <rect x={x - 11} y={y + 50} width="22" height="16" className="fill-white" />
        <rect x={x - 11} y={y + 56} width="22" height="4" className="fill-volt" />
      </g>
    </g>
  )
}

/**
 * Conteúdo da caixa: cervejas agrupadas por pré-venda, o grupo que está entrando agora
 * em destaque, um frete só, total, o que já foi pago e a previsão de envio.
 */
export function ConteudoDaCaixa({
  numero,
  grupos,
  novos,
  frete,
  total,
  rotuloTotal = 'Total da caixa',
  pago = 0,
  devido,
  previsaoEnvio,
  acao,
  className,
}: {
  numero?: number
  grupos: GrupoDaCaixa[]
  novos?: GrupoDaCaixa | null
  frete: { rotulo: string; valor: string }
  total: number
  rotuloTotal?: string
  pago?: number
  /** O que falta pagar (quando já houve pagamento). */
  devido?: number
  previsaoEnvio?: string | null
  acao?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-[24px] border border-linha bg-superficie p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="tipo-h3 flex items-center gap-2">
          <PackageOpen className="size-5 text-vip-700" aria-hidden /> Sua Caixa VIP
        </h2>
        {acao ?? (numero ? <span className="tipo-dado text-[13px] text-suave">#PRM-{numero}</span> : null)}
      </div>

      <div className="mt-3 space-y-4">
        {grupos.map((g) => (
          <Grupo key={g.chave} grupo={g} />
        ))}
        {novos && <Grupo grupo={novos} destaque />}
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-linha pt-3 text-[15px]">
        <li className="flex justify-between gap-3 text-suave">
          <span>{frete.rotulo}</span>
          <span className="tipo-dado shrink-0">{frete.valor}</span>
        </li>
        <li className="flex justify-between gap-3 font-semibold">
          <span>{rotuloTotal}</span>
          <span className="tipo-dado shrink-0">{formatarMoeda(total)}</span>
        </li>
        {pago > 0 && (
          <>
            <li className="flex justify-between gap-3 text-sucesso">
              <span>Já pago</span>
              <span className="tipo-dado shrink-0">− {formatarMoeda(pago)}</span>
            </li>
            {devido !== undefined && (
              <li className="flex justify-between gap-3 font-semibold">
                <span>Falta pagar</span>
                <span className="tipo-dado shrink-0">{formatarMoeda(devido)}</span>
              </li>
            )}
          </>
        )}
      </ul>

      {previsaoEnvio && (
        <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-papel p-3 text-[14px] leading-5 text-ink/80">
          <Truck className="mt-0.5 size-4 shrink-0 text-volt-700" aria-hidden />
          <span>
            A caixa sai inteira, de uma vez, quando a última cerveja chegar · previsão <b>{formatarData(previsaoEnvio)}</b>.
          </span>
        </p>
      )}
    </section>
  )
}

function Grupo({ grupo, destaque = false }: { grupo: GrupoDaCaixa; destaque?: boolean }) {
  return (
    <div className={cn(destaque && '-mx-2 rounded-2xl bg-volt-50 px-2 py-2.5 ring-1 ring-volt/40')}>
      <p className="tipo-rotulo flex flex-wrap items-center gap-x-2 text-suave">
        {destaque && <span className="rounded-full bg-volt px-2 py-0.5 text-ink">Entrando agora</span>}
        <span className="text-ink/70">{grupo.titulo}</span>
        {grupo.previsao && <span className="normal-case">· chega {formatarData(grupo.previsao)}</span>}
      </p>
      <ul className="mt-1.5 space-y-1 text-[15px]">
        {grupo.itens.map((i, n) => (
          <li key={`${i.descricao}-${n}`} className="flex justify-between gap-3">
            <span className="min-w-0">
              <span className="tipo-dado font-semibold">{i.quantidade}×</span> {i.descricao}
            </span>
            <span className="tipo-dado shrink-0">{formatarMoeda(i.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
