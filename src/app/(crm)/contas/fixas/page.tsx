import type { Metadata } from 'next'
import { Plus, Repeat, Tags } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { AbasContas, ComposicaoCustoFixo, TabelaContasFixas } from '@/features/contas/components/contas-fixas'
import { contasDoMes, listarContasFixas, resumirContas } from '@/features/contas/queries'
import { coresDosProjetos, resumirContasFixas } from '@/features/contas/regras'
import { mesAtual } from '@/lib/datas'
import { formatarDataCurta, formatarMes, formatarMoeda, formatarPorcentagem } from '@/lib/format'

export const metadata: Metadata = { title: 'Contas fixas' }

export default async function PaginaContasFixas() {
  const mes = mesAtual()
  // contasDoMes gera as contas fixas deste mês (se ainda não existirem) antes de listar.
  const [contas, contasDoMesAtual] = await Promise.all([listarContasFixas(), contasDoMes(mes)])

  const resumo = resumirContasFixas(contas, mes)
  const cores = coresDosProjetos(contas.map((c) => c.projeto))
  const nomeDoMes = formatarMes(mes).split(' ')[0]

  const fixasDoMes = contasDoMesAtual.filter((c) => c.tipo === 'fixa')
  const doMes = Object.fromEntries(fixasDoMes.flatMap((c) => (c.conta_fixa_id ? [[c.conta_fixa_id, c]] : [])))
  const situacaoDoMes = resumirContas(fixasDoMes)
  const pagas = fixasDoMes.filter((c) => c.status === 'paga').length
  const validas = fixasDoMes.filter((c) => c.status !== 'cancelada').length
  const proxima = fixasDoMes.find((c) => c.status === 'pendente' && c.situacao !== 'vencida')

  const novaContaFixa = (
    <ButtonLink href="/contas/fixas/nova" variante="primario">
      <Plus /> Nova conta fixa
    </ButtonLink>
  )

  return (
    <>
      <PageHeader
        contexto="Assinaturas, software e mão de obra — geradas todo mês"
        titulo="Contas a pagar"
        acoes={
          <>
            <ButtonLink href="/contas/categorias">
              <Tags /> Categorias
            </ButtonLink>
            {novaContaFixa}
          </>
        }
      />
      <AbasContas ativa="fixas" />

      {contas.length === 0 ? (
        <Card>
          <EmptyState
            icone={Repeat}
            titulo="Nenhuma conta fixa"
            descricao="Cadastre assinaturas, software, folha de pagamento... Elas aparecem automaticamente em todos os meses."
            acao={novaContaFixa}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="Custo fixo por mês" valor={formatarMoeda(resumo.total)} detalhe={`${resumo.quantidade} conta(s) ativa(s)`} />
            <Kpi rotulo="Custo fixo por ano" valor={formatarMoeda(resumo.total * 12)} detalhe="se nada mudar" />
            <Kpi
              rotulo={`Pago em ${nomeDoMes.toLowerCase()}`}
              valor={formatarMoeda(situacaoDoMes.pago)}
              tendencia="positiva"
              detalhe={`${pagas} de ${validas} conta(s)`}
            />
            <Kpi
              rotulo={`Falta pagar em ${nomeDoMes.toLowerCase()}`}
              valor={formatarMoeda(situacaoDoMes.aPagar)}
              tendencia={situacaoDoMes.qtdVencidas > 0 ? 'negativa' : situacaoDoMes.aPagar === 0 ? 'positiva' : 'neutra'}
              detalhe={
                situacaoDoMes.qtdVencidas > 0
                  ? `${situacaoDoMes.qtdVencidas} vencida(s) · ${formatarMoeda(situacaoDoMes.vencido)}`
                  : proxima
                    ? `próxima: ${proxima.descricao} em ${formatarDataCurta(proxima.vencimento)}`
                    : 'tudo pago'
              }
            />
          </div>

          <div className="space-y-6">
            {resumo.quantidade > 0 && (
              <ComposicaoCustoFixo
                total={resumo.total}
                porCategoria={resumo.porCategoria}
                porProjeto={resumo.porProjeto}
                cores={cores}
              />
            )}
            {resumo.porCategoria.map((grupo) => (
              <TabelaContasFixas
                key={grupo.nome}
                titulo={grupo.nome}
                descricao={`${grupo.contas.length} conta(s) · ${formatarMoeda(grupo.valor)} por mês · ${formatarPorcentagem(resumo.total ? grupo.valor / resumo.total : 0)} do custo fixo`}
                contas={grupo.contas}
                cores={cores}
                mes={mes}
                nomeDoMes={nomeDoMes}
                doMes={doMes}
              />
            ))}
            {resumo.foraDoTotal.length > 0 && (
              <TabelaContasFixas
                titulo="Fora do custo deste mês"
                descricao="Pausadas, encerradas ou que ainda vão começar · não entram no total"
                contas={resumo.foraDoTotal}
                cores={cores}
                mes={mes}
                nomeDoMes={nomeDoMes}
                doMes={doMes}
                foraDoTotal
              />
            )}
          </div>
        </>
      )}
    </>
  )
}
