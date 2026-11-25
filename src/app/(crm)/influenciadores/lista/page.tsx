import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, TicketPercent } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, FilterSelect, SearchField } from '@/components/ui/filter-bar'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { AbasInfluenciadores, Cupom, SeloCupomNaShopify, SeloStatusInfluenciador } from '@/features/influenciadores/components/selos'
import { AvisoDaShopify } from '@/features/influenciadores/components/shopify'
import { integracaoDoPrograma, listarInfluenciadores } from '@/features/influenciadores/queries'
import { arroba, formatarPercentual, STATUS_INFLUENCIADOR } from '@/features/influenciadores/rotulos'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'
import type { StatusInfluenciador } from '@/types'

export const metadata: Metadata = { title: 'Influenciadores' }

export default async function PaginaListaDeInfluenciadores({ searchParams }: PageProps<'/influenciadores/lista'>) {
  const busca = await searchParams
  const q = param(busca.q)
  const status = param(busca.status) as StatusInfluenciador | undefined
  const filtrado = Boolean(q || status)

  const [integracao, influenciadores] = await Promise.all([
    integracaoDoPrograma(),
    listarInfluenciadores({ busca: q, status: status && status in STATUS_INFLUENCIADOR ? status : undefined }),
  ])
  const aPagar = influenciadores.filter((i) => Number(i.saldo_disponivel) > 0).length

  return (
    <>
      <PageHeader
        titulo="Influenciadores"
        contexto={`${formatarNumero(influenciadores.length)} influenciador(es)`}
        acoes={
          <ButtonLink href="/influenciadores/novo" variante="primario">
            <Plus /> Novo influenciador
          </ButtonLink>
        }
      />
      <AbasInfluenciadores ativa="lista" aPagar={filtrado ? undefined : aPagar} />
      <AvisoDaShopify integracao={integracao} />

      <Card>
        <div className="border-b border-linha p-3 lg:p-4">
          <FilterBar caminho="/influenciadores/lista">
            <SearchField valor={q} placeholder="Nome, cupom, @ ou e-mail" />
            <FilterSelect
              name="status"
              valor={status}
              rotulo="Qualquer status"
              opcoes={Object.entries(STATUS_INFLUENCIADOR).map(([valor, { rotulo }]) => ({ valor, rotulo }))}
            />
          </FilterBar>
        </div>

        {influenciadores.length === 0 ? (
          <EmptyState
            icone={TicketPercent}
            titulo={filtrado ? 'Nenhum influenciador encontrado' : 'Nenhum influenciador ainda'}
            descricao={filtrado ? 'Tente outro nome, cupom ou status.' : 'Cadastre o primeiro: o cupom dele é criado na Shopify e as vendas passam a ser contadas.'}
            acao={
              !filtrado && (
                <ButtonLink href="/influenciadores/novo" variante="primario">
                  <Plus /> Novo influenciador
                </ButtonLink>
              )
            }
          />
        ) : (
          <>
            <ListaMobile>
              {influenciadores.map((i) => (
                <ItemMobile
                  key={i.id}
                  href={`/influenciadores/${i.id}`}
                  inicio={<Avatar nome={i.nome} />}
                  titulo={i.nome}
                  subtitulo={`${formatarNumero(i.pedidos)} pedido(s) · ${formatarMoeda(i.vendido)}`}
                  extra={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Cupom codigo={i.cupom} apagado={i.status !== 'ativo'} />
                      <SeloStatusInfluenciador status={i.status} />
                    </div>
                  }
                  fim={
                    Number(i.saldo_disponivel) > 0 ? (
                      <>
                        <p className="tipo-dado text-[14px] font-semibold">{formatarMoeda(i.saldo_disponivel)}</p>
                        <p className="tipo-rotulo mt-0.5 text-[10px] text-volt-700">a pagar</p>
                      </>
                    ) : undefined
                  }
                />
              ))}
            </ListaMobile>
            <Table somenteDesktop>
              <THead>
                <TR>
                  <TH>Influenciador</TH>
                  <TH>Cupom</TH>
                  <TH className="text-right">Pedidos</TH>
                  <TH className="text-right">Vendido</TH>
                  <TH className="text-right">Comissão</TH>
                  <TH className="text-right">A pagar</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {influenciadores.map((i) => (
                  <TR key={i.id} className="hover:bg-papel/60">
                    <TD>
                      <Link href={`/influenciadores/${i.id}`} className="flex items-center gap-3">
                        <Avatar nome={i.nome} tamanho="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold hover:text-volt-700">{i.nome}</span>
                          <span className="block truncate text-[12px] text-suave">{arroba(i.instagram) ?? i.email}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <Cupom codigo={i.cupom} apagado={i.status !== 'ativo'} />
                      <p className="tipo-dado mt-1 text-[11px] text-suave">
                        {formatarPercentual(i.desconto_percentual)} desc. · {formatarPercentual(i.comissao_percentual)} comissão
                      </p>
                    </TD>
                    <TD className="tipo-dado text-right">{formatarNumero(i.pedidos)}</TD>
                    <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(i.vendido)}</TD>
                    <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(i.comissao_total)}</TD>
                    <TD className="tipo-dado text-right whitespace-nowrap">
                      {Number(i.saldo_disponivel) > 0 ? <span className="font-semibold text-volt-700">{formatarMoeda(i.saldo_disponivel)}</span> : <span className="text-sutil">—</span>}
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <SeloStatusInfluenciador status={i.status} />
                        {i.status === 'ativo' && i.cupom_situacao !== 'ativo' && <SeloCupomNaShopify situacao={i.cupom_situacao} />}
                      </div>
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
