import type { Metadata } from 'next'
import Link from 'next/link'
import { Crown, Plus, Printer, Users } from 'lucide-react'

import { Logo } from '@/components/marca/marca'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, FilterDate, FilterSelect } from '@/components/ui/filter-bar'
import { Kpi } from '@/components/ui/kpi'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { PrintButton } from '@/components/ui/print-button'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { resumirPorCerveja, totaisDosPedidos } from '@/features/grupo-vip/resumo'
import { TabelaCobrancas } from '@/features/pedidos/components/tabela-cobrancas'
import { pedidosComItens, type FiltroPagamento } from '@/features/pedidos/queries'
import { opcoesPreVendas } from '@/features/pre-vendas/queries'
import { exigirEquipe } from '@/lib/auth'
import { inicioDoDia, somarDias } from '@/lib/datas'
import { formatarData, formatarDataHora, formatarMoeda, formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Grupo VIP' }

const FILTROS_PAGAMENTO: Record<string, { rotulo: string; valor: FiltroPagamento }> = {
  em_aberto: { rotulo: 'A receber (pendente + cobrado)', valor: 'em_aberto' },
  pendente: { rotulo: 'Ainda não cobrados', valor: 'pendente' },
  cobrado: { rotulo: 'Cobrados, aguardando', valor: 'cobrado' },
  pago: { rotulo: 'Pagos', valor: 'pago' },
}

export default async function PaginaGrupoVip({ searchParams }: PageProps<'/grupo-vip'>) {
  const busca = await searchParams
  const preVendaId = param(busca.pre_venda)
  const de = param(busca.de)
  const ate = param(busca.ate)
  const pagamento = FILTROS_PAGAMENTO[param(busca.pagamento) ?? '']?.valor

  const { supabase } = await exigirEquipe()
  const [config, preVendas, membros, pedidos] = await Promise.all([
    obterConfiguracoes(),
    opcoesPreVendas('grupo_vip'),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('vip', true),
    pedidosComItens({
      canal: 'grupo_vip',
      preVendaId,
      inicio: de ? inicioDoDia(de) : undefined,
      fim: ate ? inicioDoDia(somarDias(ate, 1)) : undefined,
      pagamento,
    }),
  ])

  const resumo = resumirPorCerveja(pedidos)
  const totais = totaisDosPedidos(pedidos)
  const preVendaSelecionada = preVendas.find((p) => p.id === preVendaId)
  const descricaoFiltro = [
    preVendaSelecionada ? `Pré-venda: ${preVendaSelecionada.titulo}` : 'Todas as pré-vendas do grupo',
    de || ate ? `Período: ${de ? formatarData(de) : 'início'} a ${ate ? formatarData(ate) : 'hoje'}` : null,
    pagamento ? `Pagamento: ${FILTROS_PAGAMENTO[pagamento].rotulo}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {/* Cabeçalho exclusivo da impressão */}
      <div className="mb-6 hidden items-center justify-between border-b border-ink pb-4 print:flex">
        <Logo variante="cor" largura={150} />
        <div className="text-right">
          <p className="tipo-h3">Relatório do Grupo VIP</p>
          <p className="text-[11px]">{descricaoFiltro}</p>
          <p className="text-[11px]">Emitido em {formatarDataHora(new Date().toISOString())}</p>
        </div>
      </div>

      <div className="print:hidden">
        <PageHeader
          contexto={`${formatarNumero(membros.count ?? 0)} membros`}
          titulo="Grupo VIP"
          descricao="Vendas do grupo, quantidade por cerveja e cobranças."
          acoes={
            <>
              <ButtonLink href="/clientes?vip=1">
                <Users /> Membros
              </ButtonLink>
              <PrintButton>
                <Printer /> Imprimir
              </PrintButton>
              <ButtonLink href="/pre-vendas/nova" variante="primario">
                <Plus /> Nova pré-venda
              </ButtonLink>
            </>
          }
        />

        <Card className="mb-5 p-3 lg:mb-6 lg:p-4">
          <FilterBar caminho="/grupo-vip">
            <FilterSelect
              name="pre_venda"
              valor={preVendaId}
              rotulo="Todas as pré-vendas"
              className="basis-full"
              opcoes={preVendas.map((p) => ({ valor: p.id ?? '', rotulo: p.titulo ?? '' }))}
            />
            <FilterDate name="de" valor={de} rotulo="De" />
            <FilterDate name="ate" valor={ate} rotulo="Até" />
            <FilterSelect
              name="pagamento"
              valor={param(busca.pagamento)}
              rotulo="Qualquer pagamento"
              className="basis-full"
              opcoes={Object.entries(FILTROS_PAGAMENTO).map(([valor, { rotulo }]) => ({ valor, rotulo }))}
            />
            {(preVendaId || de || ate || pagamento) && (
              <Link href="/grupo-vip" className="w-full py-1 text-center text-sm font-semibold text-volt-700 hover:text-ink lg:w-auto lg:py-0">
                Limpar filtros
              </Link>
            )}
          </FilterBar>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <Kpi rotulo="Pedidos" valor={formatarNumero(totais.pedidos)} />
        <Kpi rotulo="Garrafas / latas" valor={formatarNumero(totais.unidades)} />
        <Kpi rotulo="Faturado" valor={formatarMoeda(totais.faturado)} detalhe={`${formatarMoeda(totais.recebido)} recebido`} />
        <Kpi
          rotulo="A receber"
          valor={formatarMoeda(totais.aReceber)}
          tendencia={totais.emAberto > 0 ? 'negativa' : 'positiva'}
          detalhe={totais.emAberto > 0 ? `${totais.emAberto} pedido(s) em aberto` : 'tudo recebido'}
        />
      </div>

      {pedidos.length === 0 ? (
        <Card>
          <EmptyState
            icone={Crown}
            titulo="Nenhuma venda do Grupo VIP com esses filtros"
            descricao="Crie uma pré-venda com canal “Grupo VIP” e dispare o link no grupo."
            acao={<ButtonLink href="/pre-vendas/nova" variante="primario"><Plus /> Nova pré-venda</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="evitar-quebra">
            <CardHeader titulo="Quantidade por cerveja" descricao="Total vendido de cada modelo — use para pedir ao fornecedor e separar." />
            <ListaMobile>
              {resumo.map((linha) => (
                <li key={linha.chave} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{linha.descricao}</p>
                    <p className="tipo-dado text-[12px] text-suave">
                      {linha.pedidos} pedido(s) · {formatarMoeda(linha.total)}
                    </p>
                  </div>
                  <p className="tipo-numero shrink-0 text-[24px] leading-none">{formatarNumero(linha.quantidade)}</p>
                </li>
              ))}
              <li className="flex items-center gap-3 bg-papel px-4 py-3">
                <p className="flex-1 font-semibold">Total</p>
                <p className="tipo-dado text-[13px] text-suave">{formatarMoeda(resumo.reduce((s, l) => s + l.total, 0))}</p>
                <p className="tipo-numero text-[24px] leading-none">{formatarNumero(totais.unidades)}</p>
              </li>
            </ListaMobile>
            <Table somenteDesktop>
              <THead>
                <TR>
                  <TH>Cerveja / modelo</TH>
                  <TH className="text-right">Quantidade</TH>
                  <TH className="text-right">Pedidos</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {resumo.map((linha) => (
                  <TR key={linha.chave}>
                    <TD className="font-semibold">{linha.descricao}</TD>
                    <TD className="tipo-numero text-right text-lg">{formatarNumero(linha.quantidade)}</TD>
                    <TD className="tipo-dado text-right text-suave">{linha.pedidos}</TD>
                    <TD className="tipo-dado text-right">{formatarMoeda(linha.total)}</TD>
                  </TR>
                ))}
                <TR className="bg-papel print:bg-transparent">
                  <TD className="font-semibold">Total</TD>
                  <TD className="tipo-numero text-right text-lg">{formatarNumero(totais.unidades)}</TD>
                  <TD className="tipo-dado text-right">{totais.pedidos}</TD>
                  <TD className="tipo-dado text-right font-semibold">
                    {formatarMoeda(resumo.reduce((s, l) => s + l.total, 0))}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </Card>

          <Card className="quebra-antes">
            <CardHeader
              titulo="Vendas e cobranças"
              descricao="Cobre pelo WhatsApp com a mensagem pronta. Na impressão, vira a lista de separação por cliente."
            />
            <TabelaCobrancas pedidos={pedidos} config={config} />
          </Card>
        </div>
      )}
    </>
  )
}
