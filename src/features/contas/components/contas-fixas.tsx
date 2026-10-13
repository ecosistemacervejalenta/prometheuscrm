import Link from 'next/link'
import { Pause, Play } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { TabsLinks } from '@/components/ui/tabs'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatarDataCurta, formatarMesAno, formatarMoeda, formatarPorcentagem } from '@/lib/format'
import { SITUACAO_CONTA } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { ContaPagarDetalhe } from '@/types'

import { alternarContaFixa } from '../actions'
import type { ContaFixaListada } from '../queries'
import { motivoForaDoTotal, type GrupoCusto } from '../regras'

/** Abas da área de contas a pagar: o mês (fixas + variáveis) e os modelos de contas fixas. */
export function AbasContas({ ativa }: { ativa: 'mes' | 'fixas' }) {
  return (
    <TabsLinks
      ativa={ativa}
      abas={[
        { chave: 'mes', href: '/contas', rotulo: 'Contas do mês' },
        { chave: 'fixas', href: '/contas/fixas', rotulo: 'Contas fixas' },
      ]}
    />
  )
}

function ProjetoDaConta({ nome, cor }: { nome: string; cor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
      <span className="size-2 shrink-0 rounded-[3px]" style={{ background: cor }} aria-hidden />
      {nome}
    </span>
  )
}

/** Barras de participação no custo fixo (largura = fatia do total). */
function BarrasDeCusto({
  titulo,
  grupos,
  total,
  cores,
}: {
  titulo: string
  grupos: GrupoCusto<unknown>[]
  total: number
  cores?: Record<string, string>
}) {
  return (
    <div className="min-w-0">
      <h3 className="tipo-rotulo mb-1 text-suave">{titulo}</h3>
      <ol className="divide-y divide-linha" aria-label={`Custo fixo ${titulo.toLowerCase()}, do maior para o menor`}>
        {grupos.map((g) => {
          const fatia = total ? g.valor / total : 0
          return (
            <li key={g.nome} className="py-2.5">
              <div className="flex items-center gap-3">
                {cores && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: cores[g.nome] }} aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-[14px] leading-5 font-semibold text-ink">{g.nome}</span>
                <span className="tipo-dado shrink-0 text-[14px] leading-5 font-semibold text-ink">{formatarMoeda(g.valor)}</span>
                <span className="tipo-dado w-11 shrink-0 text-right text-[12px] text-suave">{formatarPorcentagem(fatia)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-papel">
                <div
                  className={cn('h-full rounded-full', !cores && 'bg-ink-600')}
                  style={{ width: `${fatia * 100}%`, background: cores?.[g.nome] }}
                />
              </div>
              <p className="mt-1 text-[12px] text-suave">{g.contas.length} conta(s)</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Para onde vai o custo fixo do mês: por categoria e por projeto. */
export function ComposicaoCustoFixo({
  total,
  porCategoria,
  porProjeto,
  cores,
}: {
  total: number
  porCategoria: GrupoCusto<unknown>[]
  porProjeto: GrupoCusto<unknown>[]
  cores: Record<string, string>
}) {
  return (
    <Card>
      <CardHeader titulo="Para onde vai o custo fixo" descricao={`${formatarMoeda(total)} por mês, por categoria e por projeto`} />
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          <BarrasDeCusto titulo="Por categoria" grupos={porCategoria} total={total} />
          <BarrasDeCusto titulo="Por projeto" grupos={porProjeto} total={total} cores={cores} />
        </div>
      </CardContent>
    </Card>
  )
}

/** Situação da conta já gerada neste mês (paga, vencida...). */
function SituacaoNoMes({ conta }: { conta?: ContaPagarDetalhe }) {
  if (!conta) return <span className="text-[13px] text-sutil">—</span>
  const situacao = SITUACAO_CONTA[conta.situacao ?? 'em_dia'] ?? SITUACAO_CONTA.em_dia
  return (
    <Badge tom={situacao.tom} ponto>
      {conta.status === 'paga' && conta.pago_em ? `${situacao.rotulo} ${formatarDataCurta(conta.pago_em)}` : situacao.rotulo}
    </Badge>
  )
}

/** Por que a conta não entra no custo do mês. */
function MotivoFora({ conta, mes }: { conta: ContaFixaListada; mes: string }) {
  const motivo = motivoForaDoTotal(conta, mes)
  if (motivo === 'encerrada' && conta.fim_em) return <Badge>Encerrou em {formatarMesAno(conta.fim_em)}</Badge>
  if (motivo === 'futura') return <Badge>Começa em {formatarMesAno(conta.inicio_em)}</Badge>
  return <Badge>Pausada</Badge>
}

/**
 * Lista de contas fixas com finalidade e projeto. Nas vigentes, mostra como está a
 * conta deste mês; nas que estão fora do total, o motivo (pausada, encerrada, futura).
 */
export function TabelaContasFixas({
  titulo,
  descricao,
  contas,
  cores,
  mes,
  nomeDoMes,
  doMes,
  foraDoTotal = false,
}: {
  titulo: string
  descricao: string
  contas: ContaFixaListada[]
  cores: Record<string, string>
  mes: string
  nomeDoMes: string
  /** Conta gerada neste mês, por id da conta fixa. */
  doMes: Record<string, ContaPagarDetalhe>
  foraDoTotal?: boolean
}) {
  const ordenadas = [...contas].sort((a, b) => Number(b.valor) - Number(a.valor) || a.descricao.localeCompare(b.descricao, 'pt-BR'))

  const situacao = (c: ContaFixaListada) =>
    foraDoTotal ? <MotivoFora conta={c} mes={mes} /> : <SituacaoNoMes conta={doMes[c.id]} />

  const acao = (c: ContaFixaListada) =>
    c.ativa ? (
      foraDoTotal ? null : (
        <ActionButton acao={alternarContaFixa.bind(null, c.id, false)} titulo="Pausar: não gera nos próximos meses">
          <Pause /> Pausar
        </ActionButton>
      )
    ) : (
      <ActionButton acao={alternarContaFixa.bind(null, c.id, true)}>
        <Play /> Reativar
      </ActionButton>
    )

  const finalidade = (c: ContaFixaListada) =>
    c.finalidade ? c.finalidade : <span className="text-sutil italic">Sem finalidade — edite para justificar o custo</span>

  return (
    <Card>
      <CardHeader titulo={titulo} descricao={descricao} />
      <ListaMobile>
        {ordenadas.map((c) => (
          <li key={c.id} className={cn('px-4 py-3', foraDoTotal && 'opacity-70')}>
            <Link href={`/contas/fixas/${c.id}/editar`} className="block active:opacity-70">
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.descricao}</p>
                <p className="tipo-dado shrink-0 text-[15px]">{formatarMoeda(c.valor)}</p>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-suave">{finalidade(c)}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-suave">
                <ProjetoDaConta nome={c.projeto} cor={cores[c.projeto]} />
                <span className="tipo-dado">todo dia {String(c.dia_vencimento).padStart(2, '0')}</span>
                {c.fornecedores?.nome && <span>{c.fornecedores.nome}</span>}
              </p>
            </Link>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              {situacao(c)}
              {acao(c)}
            </div>
          </li>
        ))}
      </ListaMobile>
      <Table somenteDesktop>
        <THead>
          <TR>
            <TH>Conta e finalidade</TH>
            <TH>Projeto</TH>
            <TH>Vence</TH>
            <TH className="text-right">Valor/mês</TH>
            <TH>{foraDoTotal ? 'Situação' : nomeDoMes}</TH>
            <TH className="text-right">Ações</TH>
          </TR>
        </THead>
        <TBody>
          {ordenadas.map((c) => (
            <TR key={c.id} className={cn(foraDoTotal && 'opacity-70')}>
              <TD>
                <Link href={`/contas/fixas/${c.id}/editar`} className="font-semibold hover:text-volt-700">
                  {c.descricao}
                </Link>
                <p className="max-w-md text-[13px] text-suave">
                  {finalidade(c)}
                  {c.fornecedores?.nome && ` · ${c.fornecedores.nome}`}
                </p>
              </TD>
              <TD className="text-[13px] whitespace-nowrap">
                <ProjetoDaConta nome={c.projeto} cor={cores[c.projeto]} />
              </TD>
              <TD className="tipo-dado text-[13px] whitespace-nowrap">dia {String(c.dia_vencimento).padStart(2, '0')}</TD>
              <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(c.valor)}</TD>
              <TD>{situacao(c)}</TD>
              <TD>
                <div className="flex justify-end">{acao(c)}</div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  )
}
