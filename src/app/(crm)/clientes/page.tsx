import type { Metadata } from 'next'
import Link from 'next/link'
import { Crown, Plus, Users } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { CLIENTES_POR_PAGINA, listarClientes } from '@/features/clientes/queries'
import { diasDesde } from '@/lib/datas'
import { formatarMoeda, formatarNumero, formatarRelativo, formatarWhatsapp } from '@/lib/format'
import { ORIGEM_CLIENTE, situacaoCliente } from '@/lib/rotulos'
import { cn, param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Clientes' }

export default async function PaginaClientes({ searchParams }: PageProps<'/clientes'>) {
  const busca = await searchParams
  const q = param(busca.q)
  const vip = param(busca.vip) === '1'
  const pagina = Math.max(1, Number(param(busca.pagina) ?? 1) || 1)

  const { clientes, total } = await listarClientes({ busca: q, vip, pagina })

  return (
    <>
      <PageHeader
        contexto={`${formatarNumero(total)} ${vip ? 'membros VIP' : 'clientes'}`}
        titulo="Clientes"
        acoes={
          <ButtonLink href="/clientes/novo" variante="primario">
            <Plus /> Novo cliente
          </ButtonLink>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-linha p-4">
          <FilterBar caminho="/clientes" className="flex-1">
            <SearchField valor={q} placeholder="Buscar por nome, e-mail ou WhatsApp" />
            {vip && <input type="hidden" name="vip" value="1" />}
          </FilterBar>
          <Link
            href={vip ? '/clientes' : '/clientes?vip=1'}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold',
              vip ? 'border-vip bg-vip-50 text-vip-700' : 'border-linha bg-superficie text-ink hover:bg-papel',
            )}
          >
            <Crown className="size-4" aria-hidden /> Só VIP
          </Link>
        </div>

        {clientes.length === 0 ? (
          <EmptyState
            icone={Users}
            titulo={q ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            descricao={q ? 'Tente outro termo de busca.' : 'Cadastre manualmente ou deixe a pré-venda cadastrar para você.'}
            acao={!q && <ButtonLink href="/clientes/novo" variante="primario"><Plus /> Novo cliente</ButtonLink>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH>Canais</TH>
                  <TH>WhatsApp</TH>
                  <TH>Último pedido</TH>
                  <TH className="text-right">LTV</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {clientes.map((c) => {
                  const situacao = situacaoCliente(c.ultimo_pedido_em, diasDesde(c.ultimo_pedido_em))
                  return (
                    <TR key={c.id} className="hover:bg-papel/60">
                      <TD>
                        <Link href={`/clientes/${c.id}`} className="flex items-center gap-3">
                          <Avatar nome={c.nome} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{c.nome}</span>
                            <span className="block truncate text-[13px] text-suave">{c.email ?? '—'}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {c.origem && c.origem !== 'manual' && (
                            <Badge tom={ORIGEM_CLIENTE[c.origem].tom}>{ORIGEM_CLIENTE[c.origem].rotulo}</Badge>
                          )}
                          {c.vip && <Badge tom="vip">VIP</Badge>}
                          {c.tags?.slice(0, 2).map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      </TD>
                      <TD className="tipo-dado text-[13px] whitespace-nowrap">{formatarWhatsapp(c.whatsapp)}</TD>
                      <TD className="tipo-dado text-[13px] whitespace-nowrap text-suave">
                        {c.pedidos ? `${formatarNumero(c.pedidos)} · ${formatarRelativo(c.ultimo_pedido_em)}` : '—'}
                      </TD>
                      <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(c.total_gasto)}</TD>
                      <TD>
                        <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
            <Pagination
              pagina={pagina}
              porPagina={CLIENTES_POR_PAGINA}
              total={total}
              caminho="/clientes"
              parametros={{ q, vip: vip ? '1' : undefined }}
            />
          </>
        )}
      </Card>
    </>
  )
}
