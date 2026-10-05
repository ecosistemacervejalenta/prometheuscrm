import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Ponto } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { Kpi } from '@/components/ui/kpi'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { contasDoMes, resumirContas, resumoContasVencidas } from '@/features/contas/queries'
import { resumoContasReceberAtrasadas } from '@/features/contas-receber/queries'
import { GraficoReceita } from '@/features/painel/components/grafico-receita'
import {
  atividadesRecentes,
  metricasComparadas,
  pedidosRecentes,
  pendenciasDeCobranca,
  preVendasEncerrando,
  receitaSemanal,
} from '@/features/painel/queries'
import { CanalBadge, PagamentoBadge } from '@/features/pedidos/components/selos'
import { exigirEquipe } from '@/lib/auth'
import { hojeISO, somarMeses } from '@/lib/datas'
import {
  formatarDataPorExtenso,
  formatarHora,
  formatarMes,
  formatarMoeda,
  formatarMoedaCompacta,
  formatarNumero,
  formatarRelativo,
  numeroPedido,
  primeiroNome,
} from '@/lib/format'
import type { Tom } from '@/lib/rotulos'

export const metadata: Metadata = { title: 'Visão geral' }

function variacao(atual: number, anterior: number) {
  if (anterior === 0) return atual > 0 ? { texto: 'primeiro mês com vendas', tendencia: 'positiva' as const } : null
  const pct = ((atual - anterior) / anterior) * 100
  return {
    texto: `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`,
    tendencia: pct >= 0 ? ('positiva' as const) : ('negativa' as const),
  }
}

export default async function PaginaVisaoGeral() {
  const { perfil } = await exigirEquipe()
  const [{ mes, atual, anterior }, semanas, pendencias, encerrando, atividades, pedidos, vencidas, receberAtrasado] =
    await Promise.all([
      metricasComparadas(),
      receitaSemanal(12),
      pendenciasDeCobranca(),
      preVendasEncerrando(),
      atividadesRecentes(),
      pedidosRecentes(),
      resumoContasVencidas(),
      resumoContasReceberAtrasadas(),
    ])
  const contas = resumirContas(await contasDoMes(mes))
  const nomeMesAnterior = formatarMes(somarMeses(mes, -1)).split(' ')[0].toLowerCase()
  const varReceita = variacao(atual.receita, anterior.receita)
  const varPedidos = variacao(atual.pedidos, anterior.pedidos)

  const atencao: Array<{ tom: Tom; texto: string; href: string }> = [
    pendencias.naoCobrados > 0 && {
      tom: 'alerta' as Tom,
      texto: `${pendencias.naoCobrados} pedido(s) ainda não cobrados`,
      href: '/grupo-vip?pagamento=pendente',
    },
    pendencias.aguardando > 0 && {
      tom: 'shopify' as Tom,
      texto: `${pendencias.aguardando} cobrança(s) aguardando pagamento`,
      href: '/pedidos?pagamento=cobrado',
    },
    vencidas.quantidade > 0 && {
      tom: 'perigo' as Tom,
      texto: `${vencidas.quantidade} conta(s) a pagar vencida(s) · ${formatarMoeda(vencidas.total)}`,
      href: '/contas',
    },
    receberAtrasado.quantidade > 0 && {
      tom: 'alerta' as Tom,
      texto: `${receberAtrasado.quantidade} conta(s) a receber atrasada(s) · ${formatarMoeda(receberAtrasado.total)}`,
      href: '/receber',
    },
    ...encerrando.map((pv) => ({
      tom: 'vip' as Tom,
      texto: `“${pv.titulo}” encerra ${formatarRelativo(pv.encerra_em) === 'hoje' ? 'hoje' : 'em breve'} às ${formatarHora(pv.encerra_em)}`,
      href: `/pre-vendas/${pv.id}`,
    })),
  ].filter(Boolean) as Array<{ tom: Tom; texto: string; href: string }>

  return (
    <>
      <PageHeader
        contexto={formatarDataPorExtenso(hojeISO())}
        titulo={`Olá, ${primeiroNome(perfil.nome) || 'equipe'}`}
        acoes={
          <>
            <FilterBar caminho="/clientes" className="hidden md:flex">
              <SearchField placeholder="Buscar cliente…" className="min-w-[240px]" />
            </FilterBar>
            <ButtonLink href="/pre-vendas/nova" variante="primario">
              <Plus /> Nova pré-venda
            </ButtonLink>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 lg:mb-6 lg:gap-3 xl:grid-cols-4">
        <Kpi
          destaque
          rotulo={`Receita · ${formatarMes(mes).split(' ')[0]}`}
          valor={formatarMoedaCompacta(atual.receita)}
          detalhe={varReceita ? `${varReceita.texto} vs. ${nomeMesAnterior}` : 'sem vendas no mês'}
        />
        <Kpi
          rotulo="Pedidos"
          valor={formatarNumero(atual.pedidos)}
          detalhe={varPedidos ? `${varPedidos.texto} · ticket ${formatarMoeda(atual.ticket_medio)}` : undefined}
          tendencia={varPedidos?.tendencia}
        />
        <Kpi
          rotulo="A receber"
          valor={formatarMoedaCompacta(atual.a_receber)}
          detalhe={`${atual.pedidos_a_receber} pedido(s) em aberto`}
          tendencia={atual.pedidos_a_receber > 0 ? 'negativa' : 'positiva'}
        />
        <Kpi
          rotulo="Contas do mês"
          valor={formatarMoedaCompacta(contas.aPagar)}
          detalhe={contas.qtdVencidas > 0 ? `${contas.qtdVencidas} vencida(s)` : `${formatarMoeda(contas.pago)} já pago`}
          tendencia={contas.qtdVencidas > 0 ? 'negativa' : 'neutra'}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:mb-6 lg:gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader titulo="Receita por canal · semanal" descricao="Últimas 12 semanas (pedidos não cancelados)." />
          <CardContent>
            <GraficoReceita semanas={semanas} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            titulo="Precisa de atenção"
            descricao={`${formatarNumero(atual.clientes_vip)} membros VIP · ${atual.pre_vendas_ativas} pré-venda(s) ativa(s)`}
          />
          <CardContent>
            {atencao.length === 0 ? (
              <p className="rounded-xl bg-volt-50 p-4 text-sm text-volt-700">Tudo em dia por aqui. 🍺</p>
            ) : (
              <ul className="divide-y divide-linha rounded-xl border border-linha">
                {atencao.map((item) => (
                  <li key={item.texto}>
                    <Link href={item.href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-papel">
                      <Ponto tom={item.tom} />
                      <span className="flex-1">{item.texto}</span>
                      <ChevronRight className="size-4 text-sutil" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            titulo="Pedidos recentes"
            acoes={
              <Link href="/pedidos" className="text-sm font-semibold text-volt-700 hover:text-ink">
                Ver todos →
              </Link>
            }
          />
          {pedidos.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-suave lg:px-5 lg:pb-6">Nenhum pedido ainda.</p>
          ) : (
            <>
            <ListaMobile>
              {pedidos.map((p) => (
                <ItemMobile
                  key={p.id}
                  href={`/pedidos/${p.id}`}
                  inicio={<Avatar nome={p.cliente_nome} />}
                  titulo={p.cliente_nome}
                  subtitulo={<span className="tipo-dado text-[12px]">{numeroPedido(p.numero)} · {formatarRelativo(p.criado_em)}</span>}
                  fim={
                    <>
                      <p className="tipo-dado text-[13px]">{formatarMoeda(p.total)}</p>
                      <div className="mt-1"><PagamentoBadge status={p.status_pagamento} /></div>
                    </>
                  }
                />
              ))}
            </ListaMobile>
            <Table somenteDesktop>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH>Canal</TH>
                  <TH>Pedido</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Pagamento</TH>
                </TR>
              </THead>
              <TBody>
                {pedidos.map((p) => (
                  <TR key={p.id} className="hover:bg-papel/60">
                    <TD>
                      <Link href={`/clientes/${p.cliente_id}`} className="flex items-center gap-3">
                        <Avatar nome={p.cliente_nome} tamanho="sm" />
                        <span className="font-semibold">{p.cliente_nome}</span>
                      </Link>
                    </TD>
                    <TD><CanalBadge canal={p.canal} /></TD>
                    <TD className="tipo-dado text-[13px] whitespace-nowrap">
                      <Link href={`/pedidos/${p.id}`} className="hover:text-volt-700">{numeroPedido(p.numero)}</Link>
                      <span className="text-suave"> · {formatarRelativo(p.criado_em)}</span>
                    </TD>
                    <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(p.total)}</TD>
                    <TD><PagamentoBadge status={p.status_pagamento} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            </>
          )}
        </Card>

        <Card>
          <CardHeader titulo="Atividade recente" />
          <CardContent>
            {atividades.length === 0 ? (
              <p className="text-sm text-suave">Nada por aqui ainda.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {atividades.map((a) => (
                  <li key={a.id} className="flex gap-3 py-3 first:pt-0">
                    <span className="tipo-dado w-11 shrink-0 text-[12px] text-suave">{formatarHora(a.criado_em)}</span>
                    <div className="min-w-0 text-sm">
                      {a.clientes?.nome && a.cliente_id && (
                        <Link href={`/clientes/${a.cliente_id}`} className="font-semibold hover:text-volt-700">
                          {a.clientes.nome}
                        </Link>
                      )}
                      <p className="text-suave">{a.descricao}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
