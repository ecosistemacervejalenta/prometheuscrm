import Link from 'next/link'
import { Crown, Plus, Users } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { diasDesde } from '@/lib/datas'
import { formatarMoeda, formatarNumero, formatarRelativo, formatarWhatsapp } from '@/lib/format'
import { ORIGEM_CLIENTE, situacaoCliente } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

import { CLIENTES_POR_PAGINA, listarClientes } from '../queries'

/**
 * Lista de clientes. Com `vip`, só os do Grupo VIP (quem compra pelas pré-vendas do grupo ou foi
 * marcado como VIP) — é a página Clientes › Grupo VIP do menu.
 */
export async function ListaDeClientes({ vip, q, pagina }: { vip: boolean; q?: string; pagina: number }) {
  const { clientes, total } = await listarClientes({ busca: q, vip, pagina })
  const caminho = vip ? '/clientes/grupo-vip' : '/clientes'

  return (
    <>
      <PageHeader
        contexto={`${formatarNumero(total)} ${vip ? (total === 1 ? 'membro' : 'membros') : 'clientes'}`}
        titulo={vip ? 'Clientes do Grupo VIP' : 'Clientes'}
        acoes={
          <ButtonLink href="/clientes/novo" variante="primario">
            <Plus /> Novo cliente
          </ButtonLink>
        }
      />

      <Card>
        <div className="flex flex-nowrap items-center gap-2 border-b border-linha p-3 lg:flex-wrap lg:p-4">
          <FilterBar caminho={caminho} className="min-w-0 flex-1">
            <SearchField valor={q} placeholder="Buscar por nome, e-mail ou WhatsApp" />
          </FilterBar>
          <Link
            href={vip ? '/clientes' : '/clientes/grupo-vip'}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold lg:h-10',
              vip ? 'border-vip bg-vip-50 text-vip-700' : 'border-linha bg-superficie text-ink hover:bg-papel',
            )}
          >
            {vip ? <Users className="size-4" aria-hidden /> : <Crown className="size-4" aria-hidden />}
            {vip ? 'Ver todos' : 'Grupo VIP'}
          </Link>
        </div>

        {clientes.length === 0 ? (
          <EmptyState
            icone={Users}
            titulo={q ? 'Nenhum cliente encontrado' : vip ? 'Nenhum membro do Grupo VIP ainda' : 'Nenhum cliente ainda'}
            descricao={
              q
                ? 'Tente outro termo de busca.'
                : vip
                  ? 'Quem compra pelo link de uma pré-venda do Grupo VIP entra aqui sozinho.'
                  : 'Cadastre manualmente ou deixe a pré-venda cadastrar para você.'
            }
            acao={!q && <ButtonLink href="/clientes/novo" variante="primario"><Plus /> Novo cliente</ButtonLink>}
          />
        ) : (
          <>
            <ListaMobile>
              {clientes.map((c) => {
                const situacao = situacaoCliente(c.ultimo_pedido_em, diasDesde(c.ultimo_pedido_em))
                return (
                  <ItemMobile
                    key={c.id}
                    href={`/clientes/${c.id}`}
                    inicio={<Avatar nome={c.nome} />}
                    titulo={
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{c.nome}</span>
                        {c.vip && <Badge tom="vip" className="h-5 px-1.5 text-[10px]">VIP</Badge>}
                      </span>
                    }
                    subtitulo={
                      c.pedidos
                        ? `${formatarNumero(c.pedidos)} pedido(s) · último ${formatarRelativo(c.ultimo_pedido_em)}`
                        : formatarWhatsapp(c.whatsapp)
                    }
                    fim={
                      <>
                        <p className="tipo-dado text-[13px]">{formatarMoeda(c.total_gasto)}</p>
                        <Badge tom={situacao.tom} className="mt-1 h-5 px-2 text-[11px]">
                          {situacao.rotulo}
                        </Badge>
                      </>
                    }
                  />
                )
              })}
            </ListaMobile>
            <Table somenteDesktop>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH>Canais</TH>
                  <TH>WhatsApp</TH>
                  <TH>Último pedido</TH>
                  <TH className="text-right">Total comprado</TH>
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
              caminho={caminho}
              parametros={{ q }}
            />
          </>
        )}
      </Card>
    </>
  )
}
