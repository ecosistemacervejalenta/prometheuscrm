import type { Metadata } from 'next'
import Link from 'next/link'
import { Pause, Play, Plus, Repeat } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { alternarContaFixa } from '@/features/contas/actions'
import { listarContasFixas } from '@/features/contas/queries'
import { formatarMes, formatarMoeda } from '@/lib/format'

export const metadata: Metadata = { title: 'Contas fixas' }

export default async function PaginaContasFixas() {
  const contas = await listarContasFixas()
  const totalMensal = contas.filter((c) => c.ativa).reduce((s, c) => s + Number(c.valor), 0)

  return (
    <>
      <PageHeader
        titulo="Contas fixas"
        contexto={`${formatarMoeda(totalMensal)} por mês em contas ativas`}
        voltar={{ href: '/contas', rotulo: 'Contas a pagar' }}
        acoes={
          <ButtonLink href="/contas/fixas/nova" variante="primario">
            <Plus /> Nova conta fixa
          </ButtonLink>
        }
      />
      <Card>
        {contas.length === 0 ? (
          <EmptyState
            icone={Repeat}
            titulo="Nenhuma conta fixa"
            descricao="Cadastre aluguel, internet, contador... Elas aparecem automaticamente em todos os meses."
            acao={<ButtonLink href="/contas/fixas/nova" variante="primario"><Plus /> Nova conta fixa</ButtonLink>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Conta</TH>
                <TH>Vence todo dia</TH>
                <TH>Período</TH>
                <TH className="text-right">Valor</TH>
                <TH>Status</TH>
                <TH className="text-right">Ações</TH>
              </TR>
            </THead>
            <TBody>
              {contas.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/contas/fixas/${c.id}/editar`} className="font-semibold hover:text-volt-700">
                      {c.descricao}
                    </Link>
                    <p className="text-[13px] text-suave">
                      {c.categoria}
                      {c.fornecedores?.nome && ` · ${c.fornecedores.nome}`}
                    </p>
                  </TD>
                  <TD className="tipo-dado">{String(c.dia_vencimento).padStart(2, '0')}</TD>
                  <TD className="text-[13px] text-suave">
                    desde {formatarMes(c.inicio_em.slice(0, 7))}
                    {c.fim_em && ` até ${formatarMes(c.fim_em.slice(0, 7))}`}
                  </TD>
                  <TD className="tipo-dado text-right">{formatarMoeda(c.valor)}</TD>
                  <TD>{c.ativa ? <Badge tom="sucesso" ponto>Ativa</Badge> : <Badge>Pausada</Badge>}</TD>
                  <TD className="text-right">
                    <ActionButton acao={alternarContaFixa.bind(null, c.id, !c.ativa)}>
                      {c.ativa ? <><Pause /> Pausar</> : <><Play /> Reativar</>}
                    </ActionButton>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  )
}
