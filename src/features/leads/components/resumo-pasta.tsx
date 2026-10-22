import { formatarNumero, formatarPorcentagem } from '@/lib/format'
import { cn } from '@/lib/utils'

import { REGIAO_DO_DDD, resumirDdds, type ContagemDdd } from '../ddd'

const DDDS_DO_BRASIL = Object.keys(REGIAO_DO_DDD).length

/**
 * Resumo da pasta: total de leads (soma das listas) em destaque e, ao lado, o que
 * dá para usar — WhatsApp válidos sem repetir, DDDs diferentes, repetidos entre
 * listas e sem WhatsApp. A conta no rodapé fecha com o total.
 */
export function ResumoPasta({
  leads,
  comWhatsapp,
  listas,
  incompletas,
  contagem,
}: {
  /** Linhas importadas, somando as listas (cada lista já descarta o número repetido nela). */
  leads: number
  /** Linhas com WhatsApp, somando as listas (o mesmo número conta uma vez por lista). */
  comWhatsapp: number
  listas: number
  incompletas: number
  /** Números diferentes da pasta por DDD (`ddds_dos_leads`). */
  contagem: ContagemDdd[]
}) {
  const { total: diferentes, semDdd, porDdd } = resumirDdds(contagem)
  const validos = diferentes - semDdd
  const repetidos = Math.max(0, comWhatsapp - diferentes)
  const semWhatsapp = Math.max(0, leads - comWhatsapp)

  const indicadores = [
    {
      rotulo: 'WhatsApp válidos',
      valor: validos,
      detalhe: `números diferentes com DDD do Brasil · ${leads ? formatarPorcentagem(validos / leads) : '—'} dos leads`,
    },
    { rotulo: 'DDDs diferentes', valor: porDdd.length, detalhe: `de ${DDDS_DO_BRASIL} DDDs do Brasil` },
    { rotulo: 'Repetidos entre listas', valor: repetidos, detalhe: 'mesmo número em mais de uma lista' },
    { rotulo: 'Sem WhatsApp', valor: semWhatsapp, detalhe: 'sem número ou número inválido' },
  ]

  return (
    <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
      <div className="p-4 lg:p-5">
        <p className="tipo-rotulo text-suave">Leads na pasta</p>
        <p className="tipo-numero mt-1 text-[44px] leading-[48px] lg:text-[56px] lg:leading-[60px]">{formatarNumero(leads)}</p>
        <p className="mt-1 text-[13px] text-suave">somando as {formatarNumero(listas)} lista(s) importada(s)</p>
      </div>
      <dl className="grid grid-cols-2 border-t border-linha lg:border-t-0 lg:border-l">
        {indicadores.map((i, n) => (
          <div
            key={i.rotulo}
            className={cn('min-w-0 p-4 lg:px-5', n % 2 === 1 && 'border-l border-linha', n >= 2 && 'border-t border-linha')}
          >
            <dt className="tipo-rotulo text-suave">{i.rotulo}</dt>
            <dd className="tipo-numero mt-1 text-[22px] leading-7 lg:text-[26px] lg:leading-8">{formatarNumero(i.valor)}</dd>
            <dd className="mt-0.5 text-[12px] leading-4 text-suave">{i.detalhe}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-linha px-4 py-3 text-[12px] text-sutil lg:col-span-2 lg:px-5">
        {formatarNumero(leads)} leads = {formatarNumero(validos)} WhatsApp válidos
        {semDdd > 0 && ` + ${formatarNumero(semDdd)} estrangeiros ou inválidos`} + {formatarNumero(repetidos)} repetidos entre listas +{' '}
        {formatarNumero(semWhatsapp)} sem WhatsApp
        {incompletas > 0 && ` · ${formatarNumero(incompletas)} lista(s) incompleta(s): os totais delas só fecham ao concluir a importação`}
      </p>
    </div>
  )
}
