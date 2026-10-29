import { Check, Trophy, X } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { somarMeses } from '@/lib/datas'
import { formatarMes, formatarMoeda, formatarMoedaCompacta, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { MetaMensal } from '../meta'

const nomeDoMes = (mes: string) => formatarMes(mes).split(' ')[0].toLowerCase()
const mesCurto = (mes: string) => `${nomeDoMes(mes).slice(0, 3)}/${mes.slice(2, 4)}`
const porcentagem = (valor: number, meta: number) => Math.floor((valor / meta) * 100)

/** Uma meta com a barra de progresso e quanto falta (ou quanto já passou). */
function Meta({
  titulo,
  descricao,
  meta,
  vendido,
  diasRestantes,
  semBase,
}: {
  titulo: string
  descricao: string
  meta: number
  vendido: number
  diasRestantes: number
  semBase?: string
}) {
  if (meta <= 0) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        <p className="mt-1.5 text-[13px] text-suave">{semBase}</p>
      </div>
    )
  }

  const batida = vendido >= meta
  const diferenca = Math.abs(meta - vendido)

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm">
          <span className="font-semibold text-ink">{titulo}</span>
          <span className="text-suave"> · {descricao}</span>
        </p>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', batida ? 'text-sucesso' : 'text-suave')}>
          {porcentagem(vendido, meta)}%
        </span>
      </div>

      <p className="mt-1 font-display text-[26px] leading-8 font-semibold tracking-tight tabular-nums" title={formatarMoeda(meta)}>
        {formatarMoedaCompacta(meta)}
      </p>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-linha"
        role="progressbar"
        aria-label={`Progresso: ${titulo.toLowerCase()}`}
        aria-valuenow={Math.min(porcentagem(vendido, meta), 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full', batida ? 'bg-sucesso' : 'bg-ink')}
          style={{ width: `${Math.min((vendido / meta) * 100, 100)}%` }}
        />
      </div>

      <p className="mt-2 text-[13px]">
        {batida ? (
          <span className="inline-flex items-center gap-1 font-medium text-sucesso">
            <Check className="size-3.5" aria-hidden /> Batida · +{formatarMoedaCompacta(diferenca)} acima
          </span>
        ) : (
          <span className="text-suave">
            Faltam <span className="font-medium text-ink tabular-nums">{formatarMoedaCompacta(diferenca)}</span>
            {diasRestantes > 1 && (
              <>
                {' · '}
                <span className="tabular-nums">{formatarMoedaCompacta(diferenca / diasRestantes)}</span> por dia
              </>
            )}
          </span>
        )}
      </p>
    </div>
  )
}

/**
 * Metas do mês na Visão geral: a meta mensal (superar o faturamento do mês anterior)
 * e a meta geral fixa. Mostra o aviso de faturamento recorde, os dias até o fim do
 * mês e o histórico da meta mensal nos últimos meses.
 */
export function MetaDoMes({ dados }: { dados: MetaMensal }) {
  const { mes, atual, meta, metaGeral, diasRestantes, recorde, melhorMes, historico } = dados
  const mesPassado = nomeDoMes(somarMeses(mes, -1))

  return (
    <Card className="overflow-hidden">
      {recorde && melhorMes && (
        <div role="status" className="flex items-start gap-2.5 bg-vip-50 px-4 py-2.5 text-sm text-vip-700 lg:px-6">
          <Trophy className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Faturamento recorde</span> — {nomeDoMes(mes)} já é o melhor mês da história,{' '}
            <span className="font-semibold tabular-nums">{formatarMoedaCompacta(atual.valor - melhorMes.valor)}</span> acima
            do recorde anterior ({mesCurto(melhorMes.mes)}).
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 pt-4 lg:px-6 lg:pt-5">
        <p className="text-sm text-suave">
          <span className="font-semibold text-ink">Metas de {nomeDoMes(mes)}</span> ·{' '}
          <span className="font-medium text-ink tabular-nums">{formatarMoedaCompacta(atual.valor)}</span> vendidos em{' '}
          {formatarNumero(atual.pedidos)} pedido(s)
        </p>
        <p className="text-[13px] text-suave">
          {diasRestantes <= 1 ? 'Hoje é o último dia do mês' : `Faltam ${diasRestantes} dias para o mês acabar`}
        </p>
      </div>

      <div className="grid gap-6 px-4 pt-4 pb-4 sm:grid-cols-2 sm:gap-10 lg:px-6 lg:pb-5">
        <Meta
          titulo="Meta mensal"
          descricao={`superar ${mesPassado}`}
          meta={meta}
          vendido={atual.valor}
          diasRestantes={diasRestantes}
          semBase={`Sem vendas em ${mesPassado} para usar como meta. No mês que vem, a meta é superar ${nomeDoMes(mes)}.`}
        />
        <Meta
          titulo="Meta geral"
          descricao="a marca para nos superar"
          meta={metaGeral}
          vendido={atual.valor}
          diasRestantes={diasRestantes}
        />
      </div>

      {historico.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-linha px-4 py-3 text-[12px] lg:px-6">
          <span className="text-suave">Meta mensal nos últimos meses</span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {historico.map((h) => (
              <li
                key={h.mes}
                title={`${formatarMes(h.mes)}: vendeu ${formatarMoeda(h.valor)} · meta ${formatarMoeda(h.meta)}`}
                className="inline-flex items-center gap-1"
              >
                {h.batida ? (
                  <Check className="size-3.5 text-sucesso" aria-label="Meta batida" />
                ) : (
                  <X className="size-3.5 text-perigo" aria-label="Meta não batida" />
                )}
                <span className="font-medium text-ink">{mesCurto(h.mes)}</span>
                <span className="text-suave tabular-nums">{porcentagem(h.valor, h.meta)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
