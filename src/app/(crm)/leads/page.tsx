import type { Metadata } from 'next'
import Link from 'next/link'
import { Folder, FolderPlus, Upload } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { listarPastas } from '@/features/leads/queries'
import { formatarDataCurta, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Banco de Leads' }

export default async function PaginaBancoDeLeads() {
  const pastas = await listarPastas()
  const totalLeads = pastas.reduce((s, p) => s + (p.leads ?? 0), 0)
  const totalWhatsapp = pastas.reduce((s, p) => s + (p.com_whatsapp ?? 0), 0)
  const totalListas = pastas.reduce((s, p) => s + (p.listas ?? 0), 0)

  return (
    <>
      <PageHeader
        contexto={`${formatarNumero(pastas.length)} pasta(s) · ${formatarNumero(totalLeads)} lead(s)`}
        titulo="Banco de Leads"
        descricao="Listas de contatos organizadas em pastas, prontas para os disparos."
        acoes={
          <>
            <ButtonLink href="/leads/pastas/nova">
              <FolderPlus /> Nova pasta
            </ButtonLink>
            <ButtonLink href="/leads/importar" variante="primario">
              <Upload /> Importar lista
            </ButtonLink>
          </>
        }
      />

      {pastas.length === 0 ? (
        <Card>
          <EmptyState
            icone={Folder}
            titulo="Nenhuma pasta ainda"
            descricao="Crie uma pasta (ex.: Central da Cerveja) e importe listas em CSV, Excel ou TXT."
            acao={
              <ButtonLink href="/leads/importar" variante="primario">
                <Upload /> Importar a primeira lista
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2.5 lg:mb-6 lg:grid-cols-4 lg:gap-3">
            <Kpi rotulo="Total de leads" valor={formatarNumero(totalLeads)} detalhe={`somando ${formatarNumero(pastas.length)} pasta(s)`} />
            <Kpi
              rotulo="Com WhatsApp"
              valor={formatarNumero(totalWhatsapp)}
              detalhe={totalLeads ? `${Math.round((totalWhatsapp / totalLeads) * 100)}% do total` : '—'}
              tendencia="positiva"
            />
            <Kpi rotulo="Sem WhatsApp" valor={formatarNumero(totalLeads - totalWhatsapp)} detalhe="ficam fora dos disparos" />
            <Kpi rotulo="Listas importadas" valor={formatarNumero(totalListas)} detalhe={`em ${formatarNumero(pastas.length)} pasta(s)`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pastas.map((p) => (
              <Link
                key={p.id}
                href={`/leads/pastas/${p.id}`}
                className="group rounded-cartao border border-linha bg-superficie p-5 shadow-cartao transition-colors hover:border-linha-forte"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt-50 text-volt-700">
                    <Folder className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold group-hover:text-volt-700">{p.nome}</p>
                    {p.descricao && <p className="mt-0.5 line-clamp-2 text-[13px] text-suave">{p.descricao}</p>}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-linha pt-3">
                  <div>
                    <dt className="tipo-rotulo text-suave">Listas</dt>
                    <dd className="tipo-dado mt-0.5 text-[15px]">{formatarNumero(p.listas)}</dd>
                  </div>
                  <div>
                    <dt className="tipo-rotulo text-suave">Leads</dt>
                    <dd className="tipo-dado mt-0.5 text-[15px]">{formatarNumero(p.leads)}</dd>
                  </div>
                  <div>
                    <dt className="tipo-rotulo text-suave">WhatsApp</dt>
                    <dd className="tipo-dado mt-0.5 text-[15px]">{formatarNumero(p.com_whatsapp)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[12px] text-sutil">
                  {p.ultima_lista_em ? `Última lista em ${formatarDataCurta(p.ultima_lista_em)}` : 'Pasta vazia'}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
