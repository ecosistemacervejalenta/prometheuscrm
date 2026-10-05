import { MessageCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatarWhatsapp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/whatsapp'
import type { LeadDetalhe } from '@/types'

import type { ColunaPlanilha } from '../planilha'
import { ICONE_TIPO } from './icones'

type Mapa = { nome: string | null; whatsapp: string | null; email: string | null }

const valorDe = (lead: LeadDetalhe, chave: string) => ((lead.dados ?? {}) as Record<string, string>)[chave] ?? ''

function BotaoWhatsapp({ numero }: { numero: string }) {
  return (
    <a
      href={linkWhatsapp(numero)}
      target="_blank"
      rel="noopener noreferrer"
      className="grid size-7 shrink-0 place-items-center rounded-lg border border-linha text-whatsapp-700 hover:bg-whatsapp-50"
      title="Conversar no WhatsApp"
      aria-label="Conversar no WhatsApp"
    >
      <MessageCircle className="size-3.5" />
    </a>
  )
}

/** Leads de uma lista com as colunas originais do arquivo, na ordem em que vieram. */
export function TabelaLeads({ leads, colunas, mapa }: { leads: LeadDetalhe[]; colunas: ColunaPlanilha[]; mapa: Mapa }) {
  const celula = (lead: LeadDetalhe, c: ColunaPlanilha) => {
    const valor = valorDe(lead, c.chave)
    if (c.chave === mapa.whatsapp) {
      if (lead.whatsapp) {
        return (
          <span className="flex items-center gap-2">
            <span className="tipo-dado whitespace-nowrap">{formatarWhatsapp(lead.whatsapp)}</span>
            <BotaoWhatsapp numero={lead.whatsapp} />
          </span>
        )
      }
      return valor ? (
        <span className="text-suave">
          {valor} <Badge tom="perigo">inválido</Badge>
        </span>
      ) : (
        <span className="text-sutil">—</span>
      )
    }
    if (c.chave === mapa.email && lead.email) {
      return (
        <a href={`mailto:${lead.email}`} className="hover:text-volt-700">
          {lead.email}
        </a>
      )
    }
    return valor || <span className="text-sutil">—</span>
  }

  const extras = colunas.filter((c) => c.chave !== mapa.nome && c.chave !== mapa.whatsapp && c.chave !== mapa.email).slice(0, 3)

  return (
    <>
      <ListaMobile>
        {leads.map((lead) => (
          <ItemMobile
            key={lead.id}
            titulo={lead.nome ?? (lead.whatsapp ? formatarWhatsapp(lead.whatsapp) : valorDe(lead, colunas[0]?.chave ?? 'c0') || 'Sem nome')}
            subtitulo={[lead.whatsapp ? formatarWhatsapp(lead.whatsapp) : null, lead.email].filter(Boolean).join(' · ') || undefined}
            fim={
              <div className="flex items-center gap-2">
                {lead.ja_cliente && <Badge tom="sucesso">Cliente</Badge>}
                {lead.whatsapp && <BotaoWhatsapp numero={lead.whatsapp} />}
              </div>
            }
            extra={
              extras.some((c) => valorDe(lead, c.chave)) ? (
                <p className="truncate text-[12px] text-suave">
                  {extras
                    .filter((c) => valorDe(lead, c.chave))
                    .map((c) => `${c.rotulo}: ${valorDe(lead, c.chave)}`)
                    .join(' · ')}
                </p>
              ) : undefined
            }
          />
        ))}
      </ListaMobile>
      <Table somenteDesktop>
        <THead>
          <TR>
            <TH className="w-12 text-right">#</TH>
            {colunas.map((c) => {
              const Icone = ICONE_TIPO[c.tipo]
              return (
                <TH key={c.chave}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icone className="size-3.5" aria-hidden />
                    {c.rotulo}
                  </span>
                </TH>
              )
            })}
            <TH>Situação</TH>
          </TR>
        </THead>
        <TBody>
          {leads.map((lead) => (
            <TR key={lead.id}>
              <TD className="tipo-dado text-right text-[12px] text-sutil">{lead.linha}</TD>
              {colunas.map((c) => (
                <TD key={c.chave} className={cn('max-w-72 text-[13px]', c.chave === mapa.nome && 'font-semibold')}>
                  <div className="truncate" title={valorDe(lead, c.chave)}>
                    {celula(lead, c)}
                  </div>
                </TD>
              ))}
              <TD>{lead.ja_cliente ? <Badge tom="sucesso" ponto>Cliente</Badge> : <span className="text-[12px] text-sutil">—</span>}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  )
}
