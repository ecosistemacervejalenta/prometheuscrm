import type { Metadata } from 'next'
import Link from 'next/link'
import { Folder, FolderPlus, Upload } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { PainelDdds } from '@/features/leads/components/painel-ddds'
import { ResumoLeads } from '@/features/leads/components/resumo-leads'
import { ResumoRegioes } from '@/features/leads/components/resumo-regioes'
import { resumirDdds } from '@/features/leads/ddd'
import { contarDddsDoBanco, listarPastas } from '@/features/leads/queries'
import { formatarDataCurta, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Banco de Leads' }

export default async function PaginaBancoDeLeads() {
  const [pastas, contagemDdds] = await Promise.all([listarPastas(), contarDddsDoBanco()])
  const totalLeads = pastas.reduce((s, p) => s + (p.leads ?? 0), 0)
  const totalWhatsapp = pastas.reduce((s, p) => s + (p.com_whatsapp ?? 0), 0)
  const totalListas = pastas.reduce((s, p) => s + (p.listas ?? 0), 0)
  const totalEmails = pastas.reduce((s, p) => s + (p.com_email ?? 0), 0)
  const totalSoEmail = pastas.reduce((s, p) => s + (p.sem_whatsapp_com_email ?? 0), 0)
  const { porDdd } = resumirDdds(contagemDdds)

  return (
    <>
      <PageHeader
        contexto={`${formatarNumero(pastas.length)} pasta(s) · ${formatarNumero(totalListas)} lista(s)`}
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
          {pastas.some((p) => p.contagem_pendente) && (
            <p className="mb-3 text-[13px] text-suave" aria-live="polite">
              Atualizando a contagem de números depois da última mudança nas listas — leva até 5 minutos. Recarregue a página para ver os números novos.
            </p>
          )}
          <Card className="mb-5 lg:mb-6">
            <ResumoLeads
              onde="banco"
              leads={totalLeads}
              comWhatsapp={totalWhatsapp}
              comEmail={totalEmails}
              semWhatsappComEmail={totalSoEmail}
              listas={totalListas}
              pastas={pastas.length}
              incompletas={0}
              contagem={contagemDdds}
            />
          </Card>

          <h2 className="tipo-h3 mb-3 text-[16px] leading-6">Pastas</h2>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:mb-6 xl:grid-cols-3">
            {pastas.map((p) => (
              <Link
                key={p.id}
                href={`/leads/pastas/${p.id}`}
                className="group flex flex-col rounded-cartao border border-linha bg-superficie p-5 shadow-cartao transition-colors hover:border-linha-forte"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt-50 text-volt-700">
                    <Folder className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold group-hover:text-volt-700">{p.nome}</p>
                    <p className="mt-0.5 truncate text-[12px] text-sutil">
                      {formatarNumero(p.listas)} lista(s)
                      {p.ultima_lista_em ? ` · última em ${formatarDataCurta(p.ultima_lista_em)}` : ' · pasta vazia'}
                    </p>
                  </div>
                </div>
                <p className="tipo-rotulo mt-4 text-suave">Leads</p>
                <p className="tipo-numero mt-0.5 text-[28px] leading-8">{formatarNumero(p.leads)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-linha pt-3">
                  {indicadoresDaPasta(p).map((i) => (
                    <div key={i.rotulo} className="min-w-0">
                      <dt className="tipo-rotulo text-suave">{i.rotulo}</dt>
                      <dd className="tipo-dado mt-0.5 text-[15px]">{formatarNumero(i.valor)}</dd>
                      {i.detalhe && <dd className="truncate text-[11px] leading-4 text-sutil">{i.detalhe}</dd>}
                    </div>
                  ))}
                </dl>
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader
              titulo="Onde estão os números"
              descricao={`WhatsApp válidos por região e por DDD, sem repetir, somando todas as pastas · ${formatarNumero(porDdd.length)} DDDs diferentes`}
            />
            <CardContent>
              <div className="mb-6 border-b border-linha pb-5">
                <ResumoRegioes porDdd={porDdd} />
              </div>
              <PainelDdds contagem={contagemDdds} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

type PastaDoBanco = Awaited<ReturnType<typeof listarPastas>>[number]

/** Os quatro números do cartão da pasta: WhatsApp (válidos, repetidos) e e-mail (com, sem WhatsApp). */
function indicadoresDaPasta(p: PastaDoBanco) {
  const semWhatsapp = Math.max(0, (p.leads ?? 0) - (p.com_whatsapp ?? 0))
  return [
    { rotulo: 'WhatsApp válidos', valor: p.whatsapp_validos ?? 0, detalhe: null },
    { rotulo: 'Repetidos', valor: Math.max(0, (p.com_whatsapp ?? 0) - (p.whatsapp_unicos ?? 0)), detalhe: 'entre listas' },
    { rotulo: 'Com e-mail', valor: p.com_email ?? 0, detalhe: null },
    {
      rotulo: 'Sem WhatsApp',
      valor: semWhatsapp,
      detalhe: semWhatsapp ? `${formatarNumero(p.sem_whatsapp_com_email ?? 0)} com e-mail` : null,
    },
  ]
}
