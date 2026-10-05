import type { Metadata } from 'next'
import { Plus, Tags } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { PedidosEmAberto } from '@/features/contas-receber/components/pedidos-em-aberto'
import { TabelaContasReceber } from '@/features/contas-receber/components/tabela-contas-receber'
import {
  contasReceberAtrasadasAntesDe,
  contasReceberDoMes,
  pedidosEmAbertoDoMes,
  resumirContasReceber,
} from '@/features/contas-receber/queries'
import { NavegadorMes } from '@/features/financeiro/components/navegador-mes'
import { mesAtual, mesValido } from '@/lib/datas'
import { formatarMoeda } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Contas a receber' }

export default async function PaginaContasReceber({ searchParams }: PageProps<'/receber'>) {
  const mes = mesValido(param((await searchParams).mes))
  const ehMesAtual = mes === mesAtual()
  const [contas, atrasadas, pedidos] = await Promise.all([
    contasReceberDoMes(mes),
    ehMesAtual ? contasReceberAtrasadasAntesDe(mes) : [],
    pedidosEmAbertoDoMes(mes),
  ])
  const resumo = resumirContasReceber(contas)
  const totalAtrasadas = atrasadas.reduce((s, c) => s + Number(c.valor ?? 0), 0)

  return (
    <>
      <PageHeader
        contexto="Lançamentos e pedidos em aberto, mês a mês"
        titulo="Contas a receber"
        acoes={
          <>
            <ButtonLink href="/contas/categorias?de=receber">
              <Tags /> Categorias
            </ButtonLink>
            <ButtonLink href="/receber/nova" variante="primario">
              <Plus /> Nova conta
            </ButtonLink>
          </>
        }
      />

      <NavegadorMes caminho="/receber" mes={mes} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Previsto no mês" valor={formatarMoeda(resumo.total)} detalhe={`${contas.length} conta(s)`} />
        <Kpi rotulo="Recebido" valor={formatarMoeda(resumo.recebido)} tendencia="positiva" detalhe="já entrou" />
        <Kpi rotulo="A receber" valor={formatarMoeda(resumo.aReceber)} detalhe="pendente" />
        <Kpi
          rotulo="Atrasado"
          valor={formatarMoeda(resumo.atrasado)}
          tendencia={resumo.qtdAtrasadas > 0 ? 'negativa' : 'neutra'}
          detalhe={resumo.qtdAtrasadas > 0 ? `${resumo.qtdAtrasadas} conta(s) em atraso` : 'nada em atraso'}
        />
      </div>

      <div className="space-y-6">
        {atrasadas.length > 0 && (
          <TabelaContasReceber
            titulo="Atrasadas de meses anteriores"
            descricao={`${atrasadas.length} conta(s) ainda não recebida(s) · ${formatarMoeda(totalAtrasadas)}`}
            contas={atrasadas}
            dataCompleta
          />
        )}
        <TabelaContasReceber
          titulo="Contas do mês"
          contas={contas}
          acoes={<ButtonLink href="/receber/nova" tamanho="sm"><Plus /> Conta</ButtonLink>}
        />
        <PedidosEmAberto pedidos={pedidos.pedidos} total={pedidos.total} />
      </div>
    </>
  )
}
