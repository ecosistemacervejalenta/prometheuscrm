import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileSpreadsheet, Pencil, Upload } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { obterPasta } from '@/features/leads/queries'
import { formatarDataCurta, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Pasta de leads' }

export default async function PaginaPasta({ params }: PageProps<'/leads/pastas/[id]'>) {
  const { id } = await params
  const pasta = await obterPasta(id)
  if (!pasta) notFound()
  const listas = pasta.listasDaPasta

  return (
    <>
      <PageHeader
        voltar={{ href: '/leads', rotulo: 'Banco de Leads' }}
        contexto={`${formatarNumero(pasta.listas)} lista(s) · ${formatarNumero(pasta.leads)} lead(s) · ${formatarNumero(pasta.com_whatsapp)} com WhatsApp`}
        titulo={pasta.nome}
        descricao={pasta.descricao ?? undefined}
        acoes={
          <>
            <ButtonLink href={`/leads/pastas/${id}/editar`}>
              <Pencil /> Editar pasta
            </ButtonLink>
            <ButtonLink href={`/leads/importar?pasta=${id}`} variante="primario">
              <Upload /> Importar lista
            </ButtonLink>
          </>
        }
      />
      <Card>
        {listas.length === 0 ? (
          <EmptyState
            icone={FileSpreadsheet}
            titulo="Nenhuma lista nesta pasta"
            descricao="Importe uma lista em CSV, Excel (XLS/XLSX) ou TXT."
            acao={
              <ButtonLink href={`/leads/importar?pasta=${id}`} variante="primario">
                <Upload /> Importar lista
              </ButtonLink>
            }
          />
        ) : (
          <>
            <ListaMobile className="border-t-0">
              {listas.map((l) => (
                <ItemMobile
                  key={l.id}
                  href={`/leads/listas/${l.id}`}
                  titulo={l.nome}
                  subtitulo={[l.origem, `${formatarNumero(l.com_whatsapp)} com WhatsApp`, formatarDataCurta(l.criado_em)].filter(Boolean).join(' · ')}
                  fim={
                    l.status === 'importando' ? (
                      <Badge tom="alerta">Incompleta</Badge>
                    ) : (
                      <span className="tipo-dado text-[15px]">{formatarNumero(l.total)}</span>
                    )
                  }
                />
              ))}
            </ListaMobile>
            <Table somenteDesktop>
              <THead>
                <TR>
                  <TH>Lista</TH>
                  <TH>Origem</TH>
                  <TH className="text-right">Leads</TH>
                  <TH className="text-right">Com WhatsApp</TH>
                  <TH>Importada em</TH>
                  <TH>Situação</TH>
                </TR>
              </THead>
              <TBody>
                {listas.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Link href={`/leads/listas/${l.id}`} className="font-semibold hover:text-volt-700">
                        {l.nome}
                      </Link>
                      {l.arquivo_nome && <p className="truncate text-[12px] text-suave">{l.arquivo_nome}</p>}
                    </TD>
                    <TD className="text-[13px]">{l.origem ?? '—'}</TD>
                    <TD className="tipo-dado text-right">{formatarNumero(l.total)}</TD>
                    <TD className="tipo-dado text-right">{formatarNumero(l.com_whatsapp)}</TD>
                    <TD className="tipo-dado text-[13px]">{formatarDataCurta(l.criado_em)}</TD>
                    <TD>
                      {l.status === 'importando' ? (
                        <Badge tom="alerta" ponto>Incompleta</Badge>
                      ) : (
                        <Badge tom="sucesso" ponto>Pronta</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Card>
    </>
  )
}
