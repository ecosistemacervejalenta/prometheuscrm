import Link from 'next/link'
import { CircleAlert, Info, Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { GraficoPizza } from '@/components/graficos/grafico-pizza'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { sincronizarOlistAgora } from '@/features/olist/actions'
import { garantirDadosRecentesDoOlist } from '@/features/olist/disparo'
import { formatarHaQuanto, formatarMoeda, formatarMoedaCompacta, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import { CANAIS } from '../canais'
import type { ChavePeriodo } from '../periodos'
import { vendasPorCanal, type DadosVendasPorCanal, type ResumoCanal } from '../queries'
import { GraficoEvolucao } from './grafico-evolucao'
import { MarcaCanal } from './marca-canal'
import { SeletorPeriodo } from './seletor-periodo'

/** Números grandes usam algarismos proporcionais (os tabulares ficam "soltos" em tamanho grande). */
const proporcional = { fontVariantNumeric: 'proportional-nums' } as const

function Variacao({ valor, comparacao, compacta = false }: { valor: number | null; comparacao: string; compacta?: boolean }) {
  if (valor === null) {
    return <p className="mt-1 text-[13px] text-suave">{compacta ? 'sem base anterior' : `sem vendas para comparar ${comparacao.replace('vs. ', '')}`}</p>
  }
  const estavel = Math.abs(valor) < 0.005
  const subiu = valor > 0
  const Icone = estavel ? Minus : subiu ? TrendingUp : TrendingDown
  const texto = `${subiu ? '+' : ''}${(valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px]">
      <span
        className={cn(
          'inline-flex items-center gap-1 font-semibold',
          estavel ? 'text-suave' : subiu ? 'text-sucesso' : 'text-perigo',
        )}
      >
        <Icone className="size-3.5" aria-hidden />
        {estavel ? 'estável' : texto}
      </span>
      {!compacta && <span className="text-suave">{comparacao}</span>}
    </p>
  )
}

function CartaoCanal({ canal, comparacao, textoAguardando }: { canal: ResumoCanal; comparacao: string; textoAguardando: string }) {
  return (
    <article
      aria-label={canal.nome}
      className="relative overflow-hidden rounded-cartao border border-linha bg-superficie p-4 shadow-cartao lg:p-5"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: canal.cor }} />

      <div className="flex items-center justify-between gap-3 sm:block">
        <div className="min-w-0">
          <div className="flex h-11 items-center">
            <MarcaCanal canal={canal} altura={26} />
          </div>
          {/* No desktop a linha existe mesmo vazia, para alinhar os valores entre os cartões. */}
          <p className={cn('tipo-rotulo mt-1 h-4 text-suave', !canal.detalhe && 'hidden sm:block')}>{canal.detalhe ?? ''}</p>
        </div>

        <div className="shrink-0 text-right sm:mt-3 sm:text-left">
          {canal.estado === 'ok' && canal.atual ? (
            <>
              <p className="tipo-numero text-[22px] leading-7 lg:text-[26px] lg:leading-8" style={proporcional}>
                {formatarMoeda(canal.atual.valor)}
              </p>
              <Variacao valor={canal.variacao} comparacao={comparacao} compacta />
            </>
          ) : canal.estado === 'erro' ? (
            <Badge tom="perigo" ponto>{canal.origem.tipo === 'crm' ? 'Erro ao ler' : 'Erro no Olist'}</Badge>
          ) : (
            <Badge tom="neutro" ponto>Aguardando Olist</Badge>
          )}
        </div>
      </div>

      <p className="mt-3 border-t border-linha pt-3 text-[13px] text-suave">
        {canal.estado === 'ok' && canal.atual ? (
          <>
            <span className="tipo-dado text-ink">{formatarNumero(canal.atual.pedidos)}</span> pedido(s)
            {canal.ticket !== null && (
              <>
                {' · ticket '}
                <span className="tipo-dado text-ink">{formatarMoeda(canal.ticket)}</span>
              </>
            )}
          </>
        ) : canal.estado === 'erro' ? (
          `Não foi possível ler as vendas ${canal.origem.tipo === 'crm' ? 'do CRM' : 'do Olist'} agora.`
        ) : (
          textoAguardando
        )}
      </p>
    </article>
  )
}

/**
 * Visão geral de vendas por canal (Mercado Livre, Shopee, Loja Virtual e Grupo VIP)
 * no período escolhido, com o total, a variação e a participação de cada canal.
 */
export async function VendasPorCanal({ periodo, comExemplo }: { periodo: ChavePeriodo; comExemplo: boolean }) {
  // Números do Olist com mais de 10 min são atualizados antes de aparecer (até 8 s de espera).
  if (!comExemplo) await garantirDadosRecentesDoOlist()
  const dados = await vendasPorCanal(periodo, { comExemplo })
  return <PainelVendasPorCanal dados={dados} periodo={periodo} />
}

/** Apresentação do painel (sem buscar dados). */
export function PainelVendasPorCanal({ dados, periodo }: { dados: DadosVendasPorCanal; periodo: ChavePeriodo }) {
  const { periodo: intervalos, canais, serie, total, pendentes, olist, comExemplo } = dados
  const comDados = canais.filter((c) => c.estado === 'ok' && c.atual)
  const nomesPendentes = pendentes.map((c) => c.nome)
  const listaPendentes =
    nomesPendentes.length > 1 ? `${nomesPendentes.slice(0, -1).join(', ')} e ${nomesPendentes.at(-1)}` : nomesPendentes[0]
  const fontes = comExemplo
    ? 'Dados de exemplo'
    : 'Mercado Livre, Shopee e Loja Virtual pelo Olist · Grupo VIP pelos pedidos do CRM'
  const textoAguardando = olist?.conectado ? 'Importando o histórico do Olist…' : 'Entra quando o Olist for conectado.'
  const comErro = pendentes.some((c) => c.estado === 'erro')

  return (
    <section aria-labelledby="titulo-vendas-canal" className="mb-5 space-y-3 lg:mb-6 lg:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-vendas-canal" className="tipo-h3">
            Vendas por canal
          </h2>
          <p className="text-[13px] text-suave">
            {intervalos.descricao} · {fontes}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {olist?.conectado && (
            <div className="flex items-center gap-2 print:hidden">
              <span className="text-[12px] text-suave">
                {olist.ultimaSincronizacao ? `Olist atualizado ${formatarHaQuanto(olist.ultimaSincronizacao)}` : 'Importando…'}
              </span>
              <ActionButton acao={sincronizarOlistAgora} titulo="Buscar agora as vendas mais recentes no Olist">
                <RefreshCw /> Atualizar
              </ActionButton>
            </div>
          )}
          <div className="w-full sm:w-auto">
            <SeletorPeriodo ativo={periodo} comExemplo={comExemplo} />
          </div>
        </div>
      </div>

      {olist?.expirada && (
        <Alert tom="erro" titulo="A conexão com o Olist expirou">
          Os números do Mercado Livre, Shopee e Loja Virtual podem estar desatualizados.{' '}
          <Link href="/configuracoes/integracoes" className="font-semibold text-ink underline underline-offset-2">
            Reconectar o Olist
          </Link>
        </Alert>
      )}
      {olist?.conectado && olist.ultimoErro && (
        <Alert tom="alerta" titulo="A última sincronização com o Olist falhou">
          {olist.ultimoErro} Os números mostram a última sincronização que deu certo.
        </Alert>
      )}

      {comExemplo && (
        <Alert tom="alerta" titulo="Dados de exemplo">
          Números fictícios, só para visualizar a tela enquanto o Olist não está conectado.{' '}
          <Link href={`/?periodo=${periodo}`} scroll={false} className="font-semibold text-ink underline underline-offset-2">
            Voltar aos dados reais
          </Link>
        </Alert>
      )}

      <Card className="grid gap-6 p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:p-6">
        <div className="min-w-0">
          <p className="tipo-rotulo text-suave">Total vendido{pendentes.length > 0 ? ' · parcial' : ''}</p>
          <p
            className="tipo-numero mt-2 text-[48px] leading-[52px] lg:text-[60px] lg:leading-[64px]"
            style={proporcional}
            title={formatarMoeda(total.valor)}
          >
            {formatarMoedaCompacta(total.valor)}
          </p>
          <Variacao valor={total.variacao} comparacao={intervalos.comparacao} />
          <p className="mt-2 text-[13px] text-suave">
            <span className="tipo-dado text-ink">{formatarNumero(total.pedidos)}</span> pedido(s)
            {total.ticket !== null && (
              <>
                {' · ticket médio '}
                <span className="tipo-dado text-ink">{formatarMoeda(total.ticket)}</span>
              </>
            )}
          </p>

          {pendentes.length > 0 && (
            <p className="mt-4 flex gap-2 rounded-xl bg-papel px-3 py-2.5 text-[13px] text-suave">
              {comErro ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-perigo" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span>
                {comErro
                  ? `Não foi possível ler as vendas agora: ${listaPendentes} ficaram de fora do total.`
                  : olist?.conectado
                    ? `Importando o histórico do Olist — ${listaPendentes} aparecem em instantes.`
                    : `${listaPendentes} entram no total quando o Olist for conectado.`}{' '}
                {!olist?.conectado && !comErro && (
                  <>
                    <Link href="/configuracoes/integracoes" className="font-semibold whitespace-nowrap text-volt-700 hover:text-ink">
                      Conectar o Olist
                    </Link>
                    {' · '}
                    <Link
                      href={`/?periodo=${periodo}&exemplo=1`}
                      scroll={false}
                      className="font-semibold whitespace-nowrap text-volt-700 hover:text-ink"
                    >
                      ver exemplo
                    </Link>
                  </>
                )}
              </span>
            </p>
          )}
        </div>

        <div className="min-w-0 lg:border-l lg:border-linha lg:pl-10">
          <p className="tipo-rotulo mb-4 text-suave">Participação no faturamento</p>
          {comDados.length > 0 ? (
            <GraficoPizza
              fatias={comDados.map((c) => ({
                id: c.id,
                nome: c.nome,
                cor: c.cor,
                valor: c.atual?.valor ?? 0,
                quantidade: c.atual?.pedidos ?? 0,
              }))}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-linha-forte px-4 py-6 text-center text-[13px] text-suave">
              A divisão entre os canais aparece quando houver dados.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canais.map((canal) => (
          <CartaoCanal key={canal.id} canal={canal} comparacao={intervalos.comparacao} textoAguardando={textoAguardando} />
        ))}
      </div>

      <Card>
        <CardHeader
          titulo="Evolução das vendas"
          descricao={`${serie.granularidade === 'semana' ? 'Por semana' : 'Por dia'} · ${intervalos.descricao}`}
        />
        <CardContent>
          {serie.pontos.length < 2 ? (
            <p className="rounded-xl border border-dashed border-linha-forte px-4 py-8 text-center text-[13px] text-suave">
              A evolução aparece a partir de 2 dias — escolha 7, 30, 60 ou 90 dias, este mês ou o mês passado.
            </p>
          ) : comDados.length === 0 ? (
            <p className="rounded-xl border border-dashed border-linha-forte px-4 py-8 text-center text-[13px] text-suave">
              A evolução aparece quando houver dados.
            </p>
          ) : (
            <GraficoEvolucao
              pontos={serie.pontos}
              canais={comDados.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor }))}
              granularidade={serie.granularidade}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-[12px] leading-5 text-suave">
        Critério igual ao Dashboard de vendas do Olist: contam todos os pedidos de Mercado Livre, Shopee e Loja Virtual pela
        data do pedido, exceto os em aberto, cancelados e com dados incompletos. Grupo VIP: pedidos do CRM não cancelados.
      </p>
    </section>
  )
}

/** Esqueleto exibido enquanto os números chegam. */
export function EsqueletoVendasPorCanal() {
  return (
    <section aria-busy="true" aria-label="Carregando vendas por canal" className="mb-5 space-y-3 lg:mb-6 lg:space-y-4">
      <div className="h-11 w-56 animate-pulse rounded-lg bg-linha/60" />
      <div className="h-60 animate-pulse rounded-cartao bg-linha/50" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CANAIS.map((c) => (
          <div key={c.id} className="h-36 animate-pulse rounded-cartao bg-linha/50" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-cartao bg-linha/50" />
    </section>
  )
}
