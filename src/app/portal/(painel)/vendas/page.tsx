import type { Metadata } from 'next'
import { ShoppingBag } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, FilterDate, FilterSelect } from '@/components/ui/filter-bar'
import { Kpi } from '@/components/ui/kpi'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { Pagination } from '@/components/ui/pagination'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SeloSituacaoVenda } from '@/features/influenciadores/components/selos'
import { VENDAS_DO_PORTAL_POR_PAGINA, vendasDoPortal, type VendaDoPortal } from '@/features/influenciadores/portal/queries'
import { formatarPercentual, SITUACAO_VENDA, type SituacaoVenda } from '@/features/influenciadores/rotulos'
import { formatarData, formatarDataCurta, formatarHora, formatarMoeda, formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Vendas' }

const dia = (valor: string | undefined) => (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined)

/** O que significa a situação, em uma linha (o influenciador não deveria precisar perguntar). */
function explicacao(v: VendaDoPortal) {
  if (v.situacao === 'a_liberar') return `libera em ${formatarData(v.liberar_em)}`
  return SITUACAO_VENDA[v.situacao].ajuda
}

export default async function PaginaVendasDoPortal({ searchParams }: PageProps<'/portal/vendas'>) {
  const busca = await searchParams
  const situacaoPedida = param(busca.situacao) as SituacaoVenda | undefined
  const situacao = situacaoPedida && situacaoPedida in SITUACAO_VENDA ? situacaoPedida : undefined
  const inicio = dia(param(busca.inicio))
  const fim = dia(param(busca.fim))
  const pagina = Math.max(1, Number(param(busca.pagina) ?? 1) || 1)
  const filtrado = Boolean(situacao || inicio || fim)

  const { vendas, total, somaBase, somaComissao } = await vendasDoPortal({ inicio, fim, situacao, pagina })

  return (
    <div className="space-y-5 lg:space-y-6">
      <header>
        <p className="tipo-dado text-[13px] text-suave">
          {formatarNumero(total)} pedido(s){filtrado ? ' no filtro' : ' com o seu cupom'}
        </p>
        <h1 className="tipo-h2 sm:tipo-h1 mt-0.5">Vendas</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <Kpi rotulo="Vendido" valor={formatarMoeda(somaBase)} detalhe="produtos, sem frete e sem cancelados" />
        <Kpi rotulo="Sua comissão" valor={formatarMoeda(somaComissao)} detalhe={filtrado ? 'do filtro' : 'de todas as vendas'} />
      </div>

      <Card>
        <div className="border-b border-linha p-3 lg:p-4">
          <FilterBar caminho="/portal/vendas">
            <FilterSelect
              name="situacao"
              valor={situacao}
              rotulo="Qualquer situação"
              className="basis-full"
              opcoes={Object.entries(SITUACAO_VENDA).map(([valor, { rotulo }]) => ({ valor, rotulo }))}
            />
            <FilterDate name="inicio" valor={inicio} rotulo="De" />
            <FilterDate name="fim" valor={fim} rotulo="Até" />
          </FilterBar>
        </div>

        {vendas.length === 0 ? (
          <EmptyState
            icone={ShoppingBag}
            titulo={filtrado ? 'Nenhuma venda neste filtro' : 'Nenhuma venda ainda'}
            descricao={filtrado ? 'Mude o período ou a situação.' : 'Os pedidos feitos com o seu cupom aparecem aqui alguns minutos depois da compra.'}
          />
        ) : (
          <>
            <ListaMobile>
              {vendas.map((v) => (
                <ItemMobile
                  key={v.id}
                  titulo={<span className="tipo-dado">{v.pedido_numero ?? 'Pedido'}</span>}
                  subtitulo={
                    <span className="tipo-dado text-[12px]">
                      {formatarDataCurta(v.pedido_em)} {formatarHora(v.pedido_em)} · {formatarMoeda(v.base)} × {formatarPercentual(v.percentual)}
                    </span>
                  }
                  extra={
                    <div>
                      <SeloSituacaoVenda situacao={v.situacao} />
                      <p className="mt-1 text-[12px] leading-4 text-suave">{explicacao(v)}</p>
                    </div>
                  }
                  fim={<p className={`tipo-dado text-[15px] font-semibold ${v.situacao === 'cancelada' ? 'text-sutil line-through' : ''}`}>{formatarMoeda(v.comissao)}</p>}
                />
              ))}
            </ListaMobile>
            <Table somenteDesktop>
              <THead>
                <TR>
                  <TH>Pedido</TH>
                  <TH>Data</TH>
                  <TH className="text-right">Produtos</TH>
                  <TH className="text-right">%</TH>
                  <TH className="text-right">Sua comissão</TH>
                  <TH>Situação</TH>
                </TR>
              </THead>
              <TBody>
                {vendas.map((v) => (
                  <TR key={v.id} className="hover:bg-papel/60">
                    <TD className="tipo-dado font-semibold">{v.pedido_numero ?? 'Pedido'}</TD>
                    <TD className="tipo-dado whitespace-nowrap text-suave">
                      {formatarData(v.pedido_em)} · {formatarHora(v.pedido_em)}
                    </TD>
                    <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(v.base)}</TD>
                    <TD className="tipo-dado text-right">{formatarPercentual(v.percentual)}</TD>
                    <TD className={`tipo-dado text-right font-semibold whitespace-nowrap ${v.situacao === 'cancelada' ? 'text-sutil line-through' : ''}`}>
                      {formatarMoeda(v.comissao)}
                    </TD>
                    <TD className="max-w-[280px]">
                      <SeloSituacaoVenda situacao={v.situacao} />
                      <p className="mt-1 text-[12px] leading-4 text-suave">{explicacao(v)}</p>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              pagina={pagina}
              porPagina={VENDAS_DO_PORTAL_POR_PAGINA}
              total={total}
              caminho="/portal/vendas"
              parametros={{ situacao, inicio, fim }}
            />
          </>
        )}
      </Card>
    </div>
  )
}
