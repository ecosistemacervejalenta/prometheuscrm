import type { Metadata } from 'next'
import { Download, ShoppingBag } from 'lucide-react'

import { ButtonExternal } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, FilterDate, FilterSelect, SearchField } from '@/components/ui/filter-bar'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { AbasInfluenciadores } from '@/features/influenciadores/components/selos'
import { AvisoDaShopify } from '@/features/influenciadores/components/shopify'
import { TabelaDeVendas } from '@/features/influenciadores/components/tabela-de-vendas'
import { integracaoDoPrograma, listarVendas, opcoesDeInfluenciadores, VENDAS_POR_PAGINA, type FiltrosDeVendas } from '@/features/influenciadores/queries'
import { SITUACAO_VENDA, type SituacaoVenda } from '@/features/influenciadores/rotulos'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Vendas dos influenciadores' }

const dia = (valor: string | undefined) => (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined)
const uuid = (valor: string | undefined) => (valor && /^[0-9a-f-]{36}$/i.test(valor) ? valor : undefined)

export default async function PaginaVendasDosInfluenciadores({ searchParams }: PageProps<'/influenciadores/vendas'>) {
  const busca = await searchParams
  const situacao = param(busca.situacao) as SituacaoVenda | undefined
  const filtros: FiltrosDeVendas = {
    influenciadorId: uuid(param(busca.influenciador)),
    situacao: situacao && situacao in SITUACAO_VENDA ? situacao : undefined,
    inicio: dia(param(busca.inicio)),
    fim: dia(param(busca.fim)),
    busca: param(busca.q),
  }
  const pagina = Math.max(1, Number(param(busca.pagina) ?? 1) || 1)

  const [integracao, opcoes, { vendas, total, somas }] = await Promise.all([integracaoDoPrograma(), opcoesDeInfluenciadores(), listarVendas(filtros, pagina)])

  const parametros = { influenciador: filtros.influenciadorId, situacao: filtros.situacao, inicio: filtros.inicio, fim: filtros.fim, q: filtros.busca }
  const exportar = new URLSearchParams(Object.entries(parametros).filter((p): p is [string, string] => Boolean(p[1]))).toString()
  const filtrado = Object.values(parametros).some(Boolean)

  return (
    <>
      <PageHeader
        titulo="Vendas com cupom"
        contexto={`${formatarNumero(total)} pedido(s)${filtrado ? ' no filtro' : ''}`}
        acoes={
          total > 0 && (
            <ButtonExternal href={`/influenciadores/vendas/exportar${exportar ? `?${exportar}` : ''}`} target="_self" rel={undefined}>
              <Download /> Baixar planilha
            </ButtonExternal>
          )
        }
      />
      <AbasInfluenciadores ativa="vendas" />
      <AvisoDaShopify integracao={integracao} />

      <div className="mb-5 grid grid-cols-3 gap-3 lg:mb-6 lg:gap-4">
        <Kpi rotulo="Pedidos válidos" valor={formatarNumero(somas.pedidos)} detalhe="sem os cancelados" />
        <Kpi rotulo="Vendido" valor={formatarMoeda(somas.vendido)} detalhe="produtos, sem frete" />
        <Kpi rotulo="Comissão" valor={formatarMoeda(somas.comissao)} detalhe={filtrado ? 'do filtro' : 'de sempre'} />
      </div>

      <Card>
        <div className="border-b border-linha p-3 lg:p-4">
          <FilterBar caminho="/influenciadores/vendas">
            <SearchField valor={filtros.busca} placeholder="Nº do pedido na Shopify" className="lg:max-w-[220px]" />
            <FilterSelect
              name="influenciador"
              valor={filtros.influenciadorId}
              rotulo="Todos os influenciadores"
              opcoes={opcoes.map((i) => ({ valor: i.id, rotulo: `${i.nome} · ${i.cupom}` }))}
            />
            <FilterSelect
              name="situacao"
              valor={filtros.situacao}
              rotulo="Qualquer situação"
              opcoes={Object.entries(SITUACAO_VENDA).map(([valor, { rotulo }]) => ({ valor, rotulo }))}
            />
            <FilterDate name="inicio" valor={filtros.inicio} rotulo="De" />
            <FilterDate name="fim" valor={filtros.fim} rotulo="Até" />
          </FilterBar>
        </div>

        {vendas.length === 0 ? (
          <EmptyState
            icone={ShoppingBag}
            titulo={filtrado ? 'Nenhuma venda neste filtro' : 'Nenhuma venda com cupom ainda'}
            descricao={
              filtrado
                ? 'Mude o período, a situação ou o influenciador.'
                : 'Quando um cliente fechar um pedido na loja usando o cupom de um influenciador, a venda aparece aqui com a comissão.'
            }
          />
        ) : (
          <>
            <TabelaDeVendas vendas={vendas} comInfluenciador comAcoes />
            <Pagination pagina={pagina} porPagina={VENDAS_POR_PAGINA} total={total} caminho="/influenciadores/vendas" parametros={parametros} />
          </>
        )}
      </Card>
    </>
  )
}
