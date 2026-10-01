import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Repeat } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { TabelaContas } from '@/features/contas/components/tabela-contas'
import { contasDoMes, resumirContas } from '@/features/contas/queries'
import { mesAtual, mesValido, somarMeses } from '@/lib/datas'
import { formatarMes, formatarMoeda } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Contas a pagar' }

export default async function PaginaContas({ searchParams }: PageProps<'/contas'>) {
  const mes = mesValido(param((await searchParams).mes))
  const contas = await contasDoMes(mes)
  const resumo = resumirContas(contas)
  const fixas = contas.filter((c) => c.tipo === 'fixa')
  const variaveis = contas.filter((c) => c.tipo === 'variavel')
  const classeSeta = 'grid size-10 place-items-center rounded-xl border border-linha bg-superficie hover:bg-papel'

  return (
    <>
      <PageHeader
        contexto="Fixas e variáveis, mês a mês"
        titulo="Contas a pagar"
        acoes={
          <>
            <ButtonLink href="/contas/fixas">
              <Repeat /> Contas fixas
            </ButtonLink>
            <ButtonLink href="/contas/nova" variante="primario">
              <Plus /> Nova conta
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 flex items-center gap-2">
        <Link href={`/contas?mes=${somarMeses(mes, -1)}`} className={classeSeta} aria-label="Mês anterior">
          <ChevronLeft className="size-4" />
        </Link>
        <p className="tipo-h3 min-w-44 text-center">{formatarMes(mes)}</p>
        <Link href={`/contas?mes=${somarMeses(mes, 1)}`} className={classeSeta} aria-label="Próximo mês">
          <ChevronRight className="size-4" />
        </Link>
        {mes !== mesAtual() && (
          <Link href="/contas" className="ml-2 text-sm font-semibold text-volt-700 hover:text-ink">
            Voltar para o mês atual
          </Link>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Total do mês" valor={formatarMoeda(resumo.total)} detalhe={`${contas.length} contas`} />
        <Kpi rotulo="Pago" valor={formatarMoeda(resumo.pago)} tendencia="positiva" detalhe="já quitado" />
        <Kpi rotulo="A pagar" valor={formatarMoeda(resumo.aPagar)} detalhe="pendente" />
        <Kpi
          rotulo="Vencido"
          valor={formatarMoeda(resumo.vencido)}
          tendencia={resumo.qtdVencidas > 0 ? 'negativa' : 'neutra'}
          detalhe={resumo.qtdVencidas > 0 ? `${resumo.qtdVencidas} conta(s) em atraso` : 'nada em atraso'}
        />
      </div>

      <div className="space-y-6">
        <TabelaContas
          titulo="Contas fixas"
          contas={fixas}
          acoes={<ButtonLink href="/contas/fixas/nova" tamanho="sm"><Plus /> Fixa</ButtonLink>}
        />
        <TabelaContas
          titulo="Contas variáveis"
          contas={variaveis}
          acoes={<ButtonLink href="/contas/nova" tamanho="sm"><Plus /> Variável</ButtonLink>}
        />
      </div>
    </>
  )
}
