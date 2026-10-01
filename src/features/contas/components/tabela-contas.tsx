import Link from 'next/link'
import { Check, Pencil, Undo2, X } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatarDataCurta, formatarMoeda } from '@/lib/format'
import { SITUACAO_CONTA } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { ContaPagarDetalhe } from '@/types'

import { pagarConta, reabrirConta, removerConta } from '../actions'

export function TabelaContas({
  titulo,
  descricao,
  contas,
  acoes,
}: {
  titulo: string
  descricao?: string
  contas: ContaPagarDetalhe[]
  acoes?: React.ReactNode
}) {
  const total = contas.filter((c) => c.status !== 'cancelada').reduce((s, c) => s + Number(c.valor ?? 0), 0)

  return (
    <Card>
      <CardHeader
        titulo={titulo}
        descricao={descricao ?? `${contas.length} conta(s) · ${formatarMoeda(total)}`}
        acoes={acoes}
      />
      {contas.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-suave">Nenhuma conta neste mês.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Conta</TH>
              <TH>Vencimento</TH>
              <TH className="text-right">Valor</TH>
              <TH>Situação</TH>
              <TH className="text-right">Ações</TH>
            </TR>
          </THead>
          <TBody>
            {contas.map((c) => {
              const situacao = SITUACAO_CONTA[c.situacao ?? 'em_dia']
              const id = c.id ?? ''
              const cancelada = c.status === 'cancelada'
              return (
                <TR key={id} className={cn(cancelada && 'opacity-50')}>
                  <TD>
                    <p className={cn('font-semibold', cancelada && 'line-through')}>{c.descricao}</p>
                    <p className="text-[13px] text-suave">
                      {c.categoria}
                      {c.fornecedor_nome && ` · ${c.fornecedor_nome}`}
                    </p>
                  </TD>
                  <TD className="tipo-dado text-[13px] whitespace-nowrap">{formatarDataCurta(c.vencimento)}</TD>
                  <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(c.valor)}</TD>
                  <TD>
                    <Badge tom={situacao.tom} ponto>
                      {situacao.rotulo}
                    </Badge>
                    {c.status === 'paga' && c.pago_em && (
                      <p className="tipo-dado mt-1 text-[11px] text-suave">pago {formatarDataCurta(c.pago_em)}</p>
                    )}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      {c.status === 'pendente' && (
                        <ActionButton acao={pagarConta.bind(null, id)} variante="primario">
                          <Check /> Pagar
                        </ActionButton>
                      )}
                      {c.status !== 'pendente' && (
                        <ActionButton acao={reabrirConta.bind(null, id)} titulo="Reabrir">
                          <Undo2 />
                        </ActionButton>
                      )}
                      <Link
                        href={`/contas/${id}/editar`}
                        className="grid size-8 place-items-center rounded-lg border border-linha bg-superficie hover:bg-papel"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Pencil className="size-4" />
                      </Link>
                      {!cancelada && (
                        <ActionButton
                          acao={removerConta.bind(null, id, c.tipo ?? 'variavel')}
                          titulo={c.tipo === 'fixa' ? 'Cancelar neste mês' : 'Excluir'}
                          confirmar={c.tipo === 'fixa' ? 'Cancelar esta conta fixa apenas neste mês?' : 'Excluir esta conta?'}
                        >
                          <X />
                        </ActionButton>
                      )}
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}
    </Card>
  )
}
