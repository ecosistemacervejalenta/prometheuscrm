import type { Metadata } from 'next'
import { Plus, Repeat, Tags } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { TabelaContas } from '@/features/contas/components/tabela-contas'
import { contasAtrasadasAntesDe, contasDoMes, resumirContas } from '@/features/contas/queries'
import { NavegadorMes } from '@/features/financeiro/components/navegador-mes'
import { mesAtual, mesValido } from '@/lib/datas'
import { formatarMoeda } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Contas a pagar' }

export default async function PaginaContas({ searchParams }: PageProps<'/contas'>) {
  const mes = mesValido(param((await searchParams).mes))
  const ehMesAtual = mes === mesAtual()
  const [contas, atrasadas] = await Promise.all([contasDoMes(mes), ehMesAtual ? contasAtrasadasAntesDe(mes) : []])
  const resumo = resumirContas(contas)
  const fixas = contas.filter((c) => c.tipo === 'fixa')
  const variaveis = contas.filter((c) => c.tipo === 'variavel')
  const totalAtrasadas = atrasadas.reduce((s, c) => s + Number(c.valor ?? 0), 0)

  return (
    <>
      <PageHeader
        contexto="Fixas e variáveis, mês a mês"
        titulo="Contas a pagar"
        acoes={
          <>
            <ButtonLink href="/contas/categorias">
              <Tags /> Categorias
            </ButtonLink>
            <ButtonLink href="/contas/fixas">
              <Repeat /> Contas fixas
            </ButtonLink>
            <ButtonLink href="/contas/nova" variante="primario">
              <Plus /> Nova conta
            </ButtonLink>
          </>
        }
      />

      <NavegadorMes caminho="/contas" mes={mes} />

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
        {atrasadas.length > 0 && (
          <TabelaContas
            titulo="Atrasadas de meses anteriores"
            descricao={`${atrasadas.length} conta(s) ainda não paga(s) · ${formatarMoeda(totalAtrasadas)}`}
            contas={atrasadas}
            dataCompleta
          />
        )}
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
