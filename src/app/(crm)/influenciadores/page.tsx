import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, TicketPercent, Trophy } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { GraficoDeVendas } from '@/features/influenciadores/components/grafico-de-vendas'
import { AbasInfluenciadores, Cupom, SeletorDePeriodo } from '@/features/influenciadores/components/selos'
import { AvisoDaShopify } from '@/features/influenciadores/components/shopify'
import { influenciadoresAPagar, integracaoDoPrograma, listarInfluenciadores, rankingDoPeriodo, resumoDoPrograma } from '@/features/influenciadores/queries'
import { intervalosDoPeriodo, periodoValido } from '@/features/vendas/periodos'
import { hojeISO } from '@/lib/datas'
import { formatarData, formatarMoeda, formatarNumero, formatarPorcentagem } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Influenciadores' }

/** "+12% vs. período anterior" (ou nada, quando não há base de comparação). */
function variacao(atual: number, anterior: number, comparacao: string) {
  if (anterior <= 0) return { texto: atual > 0 ? `primeiras vendas · ${comparacao}` : comparacao, tendencia: 'neutra' as const }
  const delta = (atual - anterior) / anterior
  const sinal = delta >= 0 ? '+' : '−'
  return { texto: `${sinal}${formatarPorcentagem(Math.abs(delta))} ${comparacao}`, tendencia: delta >= 0 ? ('positiva' as const) : ('negativa' as const) }
}

export default async function PaginaInfluenciadores({ searchParams }: PageProps<'/influenciadores'>) {
  const busca = await searchParams
  const periodo = periodoValido(param(busca.periodo) ?? '30d')
  const { atual, anterior, descricao, comparacao } = intervalosDoPeriodo(periodo, hojeISO())

  const [integracao, influenciadores, resumo, resumoAnterior, ranking, aPagar] = await Promise.all([
    integracaoDoPrograma(),
    listarInfluenciadores(),
    resumoDoPrograma(atual.inicio, atual.fim),
    resumoDoPrograma(anterior.inicio, anterior.fim),
    rankingDoPeriodo(atual.inicio, atual.fim, 10),
    influenciadoresAPagar(),
  ])

  const ativos = influenciadores.filter((i) => i.status === 'ativo').length
  const semCupom = influenciadores.filter((i) => i.status === 'ativo' && i.cupom_situacao !== 'ativo').length
  const vendas = variacao(resumo.periodo.vendido, resumoAnterior.periodo.vendido, comparacao)
  const ticket = resumo.periodo.pedidos > 0 ? resumo.periodo.vendido / resumo.periodo.pedidos : 0
  const maiorVenda = Math.max(1, ...ranking.map((r) => r.vendido))

  return (
    <>
      <PageHeader
        titulo="Influenciadores"
        contexto={`Programa de cupons · ${formatarNumero(ativos)} ativo(s) de ${formatarNumero(influenciadores.length)}`}
        acoes={
          <ButtonLink href="/influenciadores/novo" variante="primario">
            <Plus /> Novo influenciador
          </ButtonLink>
        }
      />
      <AbasInfluenciadores ativa="visao" aPagar={aPagar.length} />
      <AvisoDaShopify integracao={integracao} />

      {influenciadores.length === 0 ? (
        <Card>
          <EmptyState
            icone={TicketPercent}
            titulo="Cadastre o primeiro influenciador"
            descricao="Cada influenciador ganha um cupom da Shopify. Todo pedido feito com o cupom aparece aqui com a comissão calculada — e o influenciador acompanha tudo pelo Portal."
            acao={
              <ButtonLink href="/influenciadores/novo" variante="primario">
                <Plus /> Novo influenciador
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5 lg:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SeletorDePeriodo ativo={periodo} caminho="/influenciadores" />
            <p className="tipo-dado text-[12px] text-suave">{descricao}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <Kpi rotulo="Vendas com cupom" valor={formatarMoeda(resumo.periodo.vendido)} detalhe={vendas.texto} tendencia={vendas.tendencia} />
            <Kpi
              rotulo="Pedidos"
              valor={formatarNumero(resumo.periodo.pedidos)}
              detalhe={resumo.periodo.pedidos > 0 ? `ticket médio ${formatarMoeda(ticket)}` : 'nenhum no período'}
            />
            <Kpi
              rotulo="Comissão gerada"
              valor={formatarMoeda(resumo.periodo.comissao)}
              detalhe={resumo.periodo.vendido > 0 ? `${formatarPorcentagem(resumo.periodo.comissao / resumo.periodo.vendido)} das vendas` : 'no período'}
            />
            <Kpi
              rotulo="A pagar agora"
              valor={formatarMoeda(resumo.saldos.disponivel)}
              detalhe={aPagar.length > 0 ? `${aPagar.length} influenciador(es) com repasse liberado` : 'nenhum repasse liberado'}
              destaque
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
            <Card>
              <CardHeader titulo="Evolução das vendas" descricao="Produtos vendidos com cupom de influenciador, depois do desconto e sem o frete." />
              <CardContent>
                <GraficoDeVendas serie={resumo.serie} intervalo={atual} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader titulo="Comissões em andamento" descricao="De todos os influenciadores, em qualquer data." />
              <CardContent>
                <dl className="divide-y divide-linha text-[14px]">
                  {[
                    { rotulo: 'Aguardando pagamento do cliente', valor: resumo.saldos.aguardando, ajuda: 'Pedidos feitos e ainda não pagos.' },
                    {
                      rotulo: 'A liberar',
                      valor: resumo.saldos.a_liberar,
                      ajuda: resumo.saldos.proxima_liberacao ? `Próxima liberação em ${formatarData(resumo.saldos.proxima_liberacao)}.` : 'Pedidos pagos, dentro da carência.',
                    },
                    { rotulo: 'Disponível para repasse', valor: resumo.saldos.disponivel, ajuda: `${resumo.saldos.vendas_disponiveis} venda(s) liberada(s).` },
                    { rotulo: 'Já repassado', valor: resumo.saldos.recebido, ajuda: 'Soma de todos os repasses registrados.' },
                  ].map((linha) => (
                    <div key={linha.rotulo} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <dt className="font-medium">{linha.rotulo}</dt>
                        <p className="text-[12px] text-suave">{linha.ajuda}</p>
                      </div>
                      <dd className="tipo-dado shrink-0 font-semibold">{formatarMoeda(linha.valor)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink href="/influenciadores/pagamentos" variante="escuro" tamanho="sm">Ver repasses</ButtonLink>
                  {semCupom > 0 && (
                    <ButtonLink href="/influenciadores/lista" tamanho="sm">
                      {semCupom} cupom(ns) a conferir
                    </ButtonLink>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader
              titulo="Quem mais vendeu"
              descricao={descricao}
              acoes={<ButtonLink href={`/influenciadores/vendas?inicio=${atual.inicio}&fim=${atual.fim}`} tamanho="sm">Ver as vendas</ButtonLink>}
            />
            {ranking.length === 0 ? (
              <EmptyState icone={Trophy} titulo="Ninguém vendeu neste período" descricao="Troque o período acima ou confira se os pedidos da Shopify estão sendo lidos (aba Ajustes)." />
            ) : (
              <ol className="divide-y divide-linha border-t border-linha">
                {ranking.map((r, i) => (
                  <li key={r.influenciador_id}>
                    <Link href={`/influenciadores/${r.influenciador_id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-papel/60 lg:px-5">
                      <span className="tipo-dado w-5 shrink-0 text-center text-[13px] text-suave">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-semibold">{r.nome}</span>
                          <Cupom codigo={r.cupom} />
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-papel" aria-hidden>
                          <div className="h-full rounded-full bg-volt" style={{ width: `${Math.max(2, (r.vendido / maiorVenda) * 100)}%` }} />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tipo-dado font-semibold">{formatarMoeda(r.vendido)}</p>
                        <p className="tipo-dado text-[11px] text-suave">
                          {formatarNumero(r.pedidos)} ped. · comissão {formatarMoeda(r.comissao)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
