import { Check, Flag, Trophy, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatarMes, formatarMoeda, formatarMoedaCompacta, formatarNumero, plural } from '@/lib/format'
import { somarMeses } from '@/lib/datas'
import { cn } from '@/lib/utils'

import type { MetaMensal } from '../meta'

const proporcional = { fontVariantNumeric: 'proportional-nums' } as const

const nomeDoMes = (mes: string) => formatarMes(mes).split(' ')[0].toLowerCase()
const mesCurto = (mes: string) => `${nomeDoMes(mes).slice(0, 3)}/${mes.slice(2, 4)}`

const textoDiasRestantes = (dias: number) => `${plural(dias, 'dia')} para o mês acabar, contando hoje`

/**
 * Meta do mês na Visão geral: a meta é o faturamento do mês anterior. Mostra quanto
 * falta (ou quanto já passou), os dias restantes, o aviso de faturamento recorde e
 * o histórico das metas dos últimos meses.
 */
export function MetaDoMes({ dados }: { dados: MetaMensal }) {
  const { mes, atual, meta, falta, diasRestantes, recorde, melhorMes, historico } = dados
  const mesPassado = somarMeses(mes, -1)
  const batida = meta > 0 && falta <= 0
  const progresso = meta > 0 ? Math.min(atual.valor / meta, 1) : 0
  const porcentagem = meta > 0 ? Math.floor((atual.valor / meta) * 100) : null

  return (
    <Card className="overflow-hidden">
      {recorde && melhorMes && (
        <div role="status" className="flex items-start gap-3 border-b border-vip/30 bg-vip-50 px-4 py-3 text-vip-700 lg:px-6">
          <Trophy className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-semibold">Faturamento recorde!</span> {formatarMes(mes).split(' ')[0]} já é o melhor mês
            da história — <span className="tipo-dado">{formatarMoeda(atual.valor - melhorMes.valor)}</span> acima do recorde
            anterior ({nomeDoMes(melhorMes.mes)} de {melhorMes.mes.slice(0, 4)}, {formatarMoeda(melhorMes.valor)}).
          </p>
        </div>
      )}

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10 lg:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="tipo-rotulo text-suave">Meta de {nomeDoMes(mes)}</p>
            {batida ? (
              <Badge tom="sucesso" ponto>Meta batida</Badge>
            ) : meta > 0 ? (
              <Badge tom="neutro">{porcentagem}% da meta</Badge>
            ) : null}
          </div>

          {meta > 0 ? (
            <>
              <p className="tipo-numero mt-2 text-[28px] leading-8 lg:text-[32px] lg:leading-9" style={proporcional}>
                {formatarMoeda(meta)}
              </p>
              <p className="mt-1 text-[13px] text-suave">Faturamento de {nomeDoMes(mesPassado)} — a marca a superar.</p>

              <div
                className="mt-4 h-2.5 overflow-hidden rounded-full bg-papel ring-1 ring-inset ring-linha"
                role="progressbar"
                aria-label={`Progresso da meta de ${nomeDoMes(mes)}`}
                aria-valuenow={Math.round(progresso * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={cn('h-full rounded-full', batida ? 'bg-sucesso' : 'bg-ink')}
                  style={{ width: `${Math.max(progresso * 100, atual.valor > 0 ? 2 : 0)}%` }}
                />
              </div>
              <p className="mt-2 text-[13px] text-suave">
                <span className="tipo-dado text-ink">{formatarMoeda(atual.valor)}</span> vendidos em{' '}
                {formatarNumero(atual.pedidos)} pedido(s) até agora
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-suave">
              Sem vendas em {nomeDoMes(mesPassado)} para usar como meta. A partir do mês que vem, a meta é o faturamento deste
              mês: <span className="tipo-dado text-ink">{formatarMoeda(atual.valor)}</span> até agora.
            </p>
          )}
        </div>

        {meta > 0 && (
          <div className="min-w-0 border-t border-linha pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            {batida ? (
              <>
                <p className="tipo-rotulo text-suave">Acima da meta</p>
                <p className="tipo-numero mt-2 text-[28px] leading-8 text-sucesso lg:text-[32px] lg:leading-9" style={proporcional}>
                  +{formatarMoeda(-falta)}
                </p>
                <p className="mt-1 text-[13px] text-suave">
                  Já vendemos {porcentagem}% do faturamento de {nomeDoMes(mesPassado)} —{' '}
                  {diasRestantes <= 1 ? 'e hoje é o último dia do mês' : `e ainda faltam ${textoDiasRestantes(diasRestantes)}`}.
                </p>
              </>
            ) : (
              <>
                <p className="tipo-rotulo text-suave">Falta para a meta</p>
                <p className="tipo-numero mt-2 text-[28px] leading-8 lg:text-[32px] lg:leading-9" style={proporcional}>
                  {formatarMoeda(falta)}
                </p>
                <p className="mt-1 text-[13px] text-suave">
                  {diasRestantes <= 1 ? (
                    <>Hoje é o último dia do mês.</>
                  ) : (
                    <>
                      Faltam {textoDiasRestantes(diasRestantes)} — cerca de{' '}
                      <span className="tipo-dado text-ink">{formatarMoedaCompacta(falta / diasRestantes)}</span> por dia.
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {historico.length > 0 && (
        <div className="border-t border-linha px-4 py-3 lg:px-6">
          <p className="tipo-rotulo mb-2 flex items-center gap-1.5 text-suave">
            <Flag className="size-3.5" aria-hidden /> Metas dos últimos meses
          </p>
          <ul className="flex flex-wrap gap-2">
            {historico.map((h) => (
              <li
                key={h.mes}
                title={`${formatarMes(h.mes)}: vendeu ${formatarMoeda(h.valor)} · meta ${formatarMoeda(h.meta)}`}
                className="flex items-center gap-2 rounded-lg border border-linha bg-papel px-2.5 py-1.5 text-[12px]"
              >
                <span
                  className={cn(
                    'grid size-4 place-items-center rounded-full',
                    h.batida ? 'bg-sucesso text-white' : 'bg-perigo-50 text-perigo',
                  )}
                  aria-label={h.batida ? 'Meta batida' : 'Meta não batida'}
                >
                  {h.batida ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                </span>
                <span className="font-semibold text-ink">{mesCurto(h.mes)}</span>
                <span className="tipo-dado text-suave">
                  {formatarMoedaCompacta(h.valor)} / {formatarMoedaCompacta(h.meta)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
