import type { Metadata } from 'next'
import Link from 'next/link'
import { Crown, Link2, Plus, Printer, Send, Truck, Users } from 'lucide-react'

import { Logo } from '@/components/marca/marca'
import { Alert } from '@/components/ui/alert'
import { ButtonExternal, ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, FilterDate, FilterSelect } from '@/components/ui/filter-bar'
import { Kpi } from '@/components/ui/kpi'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { PrintButton } from '@/components/ui/print-button'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { resumoCepsVip } from '@/features/frete/queries'
import { resumirPorCerveja, totaisDosPedidos } from '@/features/grupo-vip/resumo'
import { TabelaCobrancas } from '@/features/pedidos/components/tabela-cobrancas'
import { pedidosComItens, type FiltroPagamento } from '@/features/pedidos/queries'
import { opcoesPreVendas } from '@/features/pre-vendas/queries'
import { exigirEquipe } from '@/lib/auth'
import { inicioDoDia, somarDias } from '@/lib/datas'
import { formatarData, formatarDataHora, formatarMoeda, formatarNumero } from '@/lib/format'
import { linkPreVenda } from '@/lib/url'
import { param } from '@/lib/utils'
import { linkWhatsapp, mensagemPreVenda } from '@/lib/whatsapp'
import type { SituacaoFrete } from '@/types'

export const metadata: Metadata = { title: 'Grupo VIP' }

const FILTROS_PAGAMENTO: Record<string, { rotulo: string; valor: FiltroPagamento }> = {
  em_aberto: { rotulo: 'A receber (pendente + cobrado)', valor: 'em_aberto' },
  pendente: { rotulo: 'Ainda não cobrados', valor: 'pendente' },
  cobrado: { rotulo: 'Cobrados, aguardando', valor: 'cobrado' },
  pago: { rotulo: 'Pagos', valor: 'pago' },
}

const FILTROS_FRETE: Record<SituacaoFrete, string> = {
  a_cotar: 'Frete a cotar',
  cotado: 'Frete cotado',
  vip: 'Frete VIP (CEP na lista)',
}

export default async function PaginaGrupoVip({ searchParams }: PageProps<'/grupo-vip'>) {
  const busca = await searchParams
  const preVendaId = param(busca.pre_venda)
  const de = param(busca.de)
  const ate = param(busca.ate)
  const pagamento = FILTROS_PAGAMENTO[param(busca.pagamento) ?? '']?.valor
  const frete = (Object.keys(FILTROS_FRETE) as SituacaoFrete[]).find((f) => f === param(busca.frete))

  const { supabase, perfil } = await exigirEquipe()
  const [config, preVendas, membros, pedidos, ceps] = await Promise.all([
    obterConfiguracoes(),
    opcoesPreVendas('grupo_vip'),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('vip', true),
    pedidosComItens({
      canal: 'grupo_vip',
      preVendaId,
      inicio: de ? inicioDoDia(de) : undefined,
      fim: ate ? inicioDoDia(somarDias(ate, 1)) : undefined,
      pagamento,
      frete,
    }),
    resumoCepsVip(),
  ])

  const resumo = resumirPorCerveja(pedidos)
  const totais = totaisDosPedidos(pedidos)
  const aCotar = pedidos.filter((p) => p.frete === 'a_cotar').length
  const ativas = await Promise.all(
    preVendas
      .filter((p) => p.status_efetivo === 'ativa' && p.slug)
      .map(async (p) => {
        const link = await linkPreVenda(p.slug ?? '')
        const mensagem = mensagemPreVenda(
          config,
          { titulo: p.titulo ?? '', descricao: p.descricao, encerra_em: p.encerra_em, previsao_entrega: p.previsao_entrega },
          link,
        )
        return { id: p.id ?? '', titulo: p.titulo ?? '', link, mensagem }
      }),
  )
  const pendenciasConfig = [
    !config.chave_pix && { texto: 'Cadastrar a chave PIX (aparece no fim do link)', href: '/configuracoes' },
    !config.whatsapp_comprovante && { texto: 'Informar o WhatsApp que recebe os comprovantes', href: '/configuracoes' },
    ceps.ceps_cobertos === 0 && { texto: 'Enviar a planilha de CEPs com frete fixo', href: '/configuracoes/frete' },
  ].filter((p): p is { texto: string; href: string } => Boolean(p))
  const preVendaSelecionada = preVendas.find((p) => p.id === preVendaId)
  const descricaoFiltro = [
    preVendaSelecionada ? `Pré-venda: ${preVendaSelecionada.titulo}` : 'Todas as pré-vendas do grupo',
    de || ate ? `Período: ${de ? formatarData(de) : 'início'} a ${ate ? formatarData(ate) : 'hoje'}` : null,
    pagamento ? `Pagamento: ${FILTROS_PAGAMENTO[pagamento].rotulo}` : null,
    frete ? FILTROS_FRETE[frete] : null,
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

        {pendenciasConfig.length > 0 && (
          <Alert tom="alerta" titulo="Complete a configuração do link de pré-venda" className="mb-5 lg:mb-6">
            <ul className="mt-1 space-y-0.5">
              {pendenciasConfig.map((p) => (
                <li key={p.texto}>
                  •{' '}
                  <Link href={p.href} className="font-semibold underline-offset-2 hover:underline">
                    {p.texto}
                  </Link>
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {ativas.map((pv) => (
          <Card key={pv.id} className="mb-5 flex flex-wrap items-center gap-3 p-4 lg:mb-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-vip-50 text-vip-700">
              <Link2 className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="tipo-rotulo text-suave">Link no ar · {pv.titulo}</p>
              <a href={pv.link} target="_blank" rel="noopener noreferrer" className="tipo-dado block truncate text-[13px] font-semibold hover:text-volt-700">
                {pv.link}
              </a>
            </div>
            <div className="flex w-full gap-2 *:grow sm:w-auto sm:*:grow-0">
              <CopyButton texto={pv.link} rotulo="Copiar link" tamanho="md" />
              <ButtonExternal href={linkWhatsapp(null, pv.mensagem)} variante="whatsapp">
                <Send /> Disparar no grupo
              </ButtonExternal>
            </div>
          </Card>
        ))}

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
            <FilterSelect
              name="frete"
              valor={frete}
              rotulo="Qualquer frete"
              className="basis-full"
              opcoes={Object.entries(FILTROS_FRETE).map(([valor, rotulo]) => ({ valor, rotulo }))}
            />
            {(preVendaId || de || ate || pagamento || frete) && (
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

      {aCotar > 0 && frete !== 'a_cotar' && (
        <Alert tom="alerta" titulo={`${aCotar} pedido(s) com frete a cotar`} className="mb-6 print:hidden">
          CEP fora da lista VIP. Informe o valor do frete em cada pedido e envie ao cliente pelo WhatsApp antes do fechamento.{' '}
          <Link href="/grupo-vip?frete=a_cotar" className="inline-flex items-center gap-1 font-semibold whitespace-nowrap underline-offset-2 hover:underline">
            <Truck className="size-3.5" aria-hidden /> Ver só esses
          </Link>
        </Alert>
      )}

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
            <TabelaCobrancas pedidos={pedidos} config={config} podeExcluir={perfil.papel === 'admin'} />
          </Card>
        </div>
      )}
    </>
  )
}
