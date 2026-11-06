import { Mail, MessageCircle } from 'lucide-react'

import { formatarNumero, formatarPorcentagem } from '@/lib/format'

import { resumirDdds, type ContagemDdd } from '../ddd'

/**
 * Resumo da pasta ou do banco: total de leads (soma das listas) em destaque e, ao
 * lado, como dá para falar com eles — uma linha de WhatsApp (válidos sem repetir,
 * repetidos entre listas, sem WhatsApp) e uma de e-mail (com, sem, sem nenhum
 * contato). A conta no rodapé fecha com o total.
 */
export function ResumoLeads({
  onde,
  leads,
  comWhatsapp,
  comEmail,
  semWhatsappComEmail,
  listas,
  pastas = 1,
  incompletas,
  contagem,
}: {
  onde: 'pasta' | 'banco'
  /** Linhas importadas, somando as listas (cada lista já descarta o número repetido nela). */
  leads: number
  /** Linhas com WhatsApp, somando as listas (o mesmo número conta uma vez por lista). */
  comWhatsapp: number
  comEmail: number
  semWhatsappComEmail: number
  listas: number
  pastas?: number
  incompletas: number
  /** Números diferentes por DDD (guardados na lista, na pasta e em `leads_resumo`). */
  contagem: ContagemDdd[]
}) {
  const { total: diferentes, semDdd } = resumirDdds(contagem)
  const validos = diferentes - semDdd
  const repetidos = Math.max(0, comWhatsapp - diferentes)
  const semWhatsapp = Math.max(0, leads - comWhatsapp)
  const semEmail = Math.max(0, leads - comEmail)
  const semContato = Math.max(0, semWhatsapp - semWhatsappComEmail)
  const dosLeads = (n: number) => (leads ? `${formatarPorcentagem(n / leads)} dos leads` : '—')

  const linhas = [
    {
      canal: 'WhatsApp',
      icone: MessageCircle,
      indicadores: [
        { rotulo: 'WhatsApp válidos', valor: validos, detalhe: `números diferentes, com DDD do Brasil · ${dosLeads(validos)}` },
        {
          rotulo: 'Repetidos entre listas',
          valor: repetidos,
          detalhe: `mesmo número em mais de uma ${onde === 'pasta' ? 'lista' : 'lista ou pasta'} · já contados 1 vez nos válidos`,
        },
        {
          rotulo: 'Sem WhatsApp',
          valor: semWhatsapp,
          detalhe: semWhatsapp
            ? `${formatarNumero(semWhatsappComEmail)} têm e-mail · ${formatarNumero(semContato)} sem nenhum contato`
            : 'todos os leads têm WhatsApp',
        },
      ],
    },
    {
      canal: 'E-mail',
      icone: Mail,
      indicadores: [
        { rotulo: 'Com e-mail', valor: comEmail, detalhe: dosLeads(comEmail) },
        { rotulo: 'Sem e-mail', valor: semEmail, detalhe: dosLeads(semEmail) },
        { rotulo: 'Sem nenhum contato', valor: semContato, detalhe: 'sem WhatsApp e sem e-mail' },
      ],
    },
  ]

  return (
    <div className="grid lg:grid-cols-[minmax(0,0.75fr)_minmax(0,2fr)]">
      <div className="p-4 lg:p-5">
        <p className="tipo-rotulo text-suave">{onde === 'pasta' ? 'Leads na pasta' : 'Leads no banco'}</p>
        <p className="tipo-numero mt-1 text-[44px] leading-[48px] lg:text-[56px] lg:leading-[60px]">{formatarNumero(leads)}</p>
        <p className="mt-1 text-[13px] text-suave">
          {onde === 'pasta'
            ? `somando as ${formatarNumero(listas)} lista(s) importada(s)`
            : `somando ${formatarNumero(listas)} lista(s) em ${formatarNumero(pastas)} pasta(s)`}
        </p>
      </div>

      <div className="grid gap-px border-t border-linha bg-linha lg:border-t-0 lg:border-l">
        {linhas.map(({ canal, icone: Icone, indicadores }) => (
          <section key={canal} aria-label={canal} className="bg-superficie">
            <p className="flex items-center gap-1.5 px-4 pt-3 text-[12px] font-semibold text-ink lg:px-5">
              <Icone className="size-3.5 text-suave" aria-hidden />
              {canal}
            </p>
            <dl className="grid sm:grid-cols-3">
              {indicadores.map((i) => (
                <div key={i.rotulo} className="min-w-0 px-4 pt-1.5 pb-3.5 lg:px-5">
                  <dt className="tipo-rotulo text-suave">{i.rotulo}</dt>
                  <dd className="tipo-numero mt-1 text-[22px] leading-7 lg:text-[26px] lg:leading-8">{formatarNumero(i.valor)}</dd>
                  <dd className="mt-0.5 text-[12px] leading-4 text-suave">{i.detalhe}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="border-t border-linha px-4 py-3 text-[12px] text-sutil lg:col-span-2 lg:px-5">
        {formatarNumero(leads)} leads = {formatarNumero(validos)} WhatsApp válidos
        {semDdd > 0 && ` + ${formatarNumero(semDdd)} estrangeiros ou inválidos`} + {formatarNumero(repetidos)} repetidos entre listas +{' '}
        {formatarNumero(semWhatsapp)} sem WhatsApp
        {incompletas > 0 && ` · ${formatarNumero(incompletas)} lista(s) incompleta(s): os totais delas só fecham ao concluir a importação`}
      </p>
    </div>
  )
}
