import Link from 'next/link'
import { Check, Pencil, Undo2, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { EstadoAcao } from '@/lib/acoes'
import { formatarData, formatarDataCurta, formatarMoeda } from '@/lib/format'
import type { Tom } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

type Acao = () => Promise<EstadoAcao>

/** Linha genérica de conta (a pagar ou a receber). */
export type Lancamento = {
  id: string
  descricao: string
  detalhe: string
  vencimento: string | null
  valor: number | null
  /** Chave de `situacoes` (paga, recebida, vencida, vence_logo, em_dia, cancelada). */
  situacao: string
  status: 'pendente' | 'quitada' | 'cancelada'
  quitadaEm: string | null
  hrefEditar: string
  quitar: Acao
  reabrir: Acao
  remover?: { acao: Acao; titulo: string; confirmar: string }
}

/**
 * Lista de contas com ações de um toque (pagar/receber, reabrir, editar, excluir).
 * Celular: lista; desktop: tabela.
 */
export function TabelaLancamentos({
  titulo,
  descricao,
  lancamentos,
  acoes,
  situacoes,
  rotuloQuitar,
  prefixoQuitada,
  vazio = 'Nenhuma conta neste mês.',
  dataCompleta = false,
}: {
  titulo: string
  descricao?: string
  lancamentos: Lancamento[]
  acoes?: ReactNode
  situacoes: Record<string, { rotulo: string; tom: Tom }>
  /** "Pagar" | "Receber" */
  rotuloQuitar: string
  /** "pago" | "recebido" */
  prefixoQuitada: string
  vazio?: string
  /** Mostra o ano no vencimento (útil para contas de meses anteriores). */
  dataCompleta?: boolean
}) {
  const total = lancamentos.filter((l) => l.status !== 'cancelada').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const data = dataCompleta ? formatarData : formatarDataCurta

  const botoes = (l: Lancamento, compacto: boolean) => (
    <>
      {l.status === 'pendente' && (
        <ActionButton acao={l.quitar} variante="primario">
          <Check /> {rotuloQuitar}
        </ActionButton>
      )}
      {l.status !== 'pendente' && (
        <ActionButton acao={l.reabrir} titulo="Reabrir">
          <Undo2 /> {compacto ? null : 'Reabrir'}
        </ActionButton>
      )}
      {compacto && (
        <Link
          href={l.hrefEditar}
          className="grid size-8 place-items-center rounded-lg border border-linha bg-superficie hover:bg-papel"
          title="Editar"
          aria-label="Editar"
        >
          <Pencil className="size-4" />
        </Link>
      )}
      {l.status !== 'cancelada' && l.remover && (
        <ActionButton acao={l.remover.acao} titulo={l.remover.titulo} confirmar={l.remover.confirmar}>
          <X />
        </ActionButton>
      )}
    </>
  )

  return (
    <Card>
      <CardHeader
        titulo={titulo}
        descricao={descricao ?? `${lancamentos.length} conta(s) · ${formatarMoeda(total)}`}
        acoes={acoes}
      />
      {lancamentos.length === 0 ? (
        <p className="px-4 pb-5 text-sm text-suave lg:px-5 lg:pb-6">{vazio}</p>
      ) : (
        <>
          <ListaMobile>
            {lancamentos.map((l) => {
              const situacao = situacoes[l.situacao] ?? situacoes.em_dia
              const cancelada = l.status === 'cancelada'
              return (
                <li key={l.id} className={cn('px-4 py-3', cancelada && 'opacity-50')}>
                  <Link href={l.hrefEditar} className="flex items-start gap-3 active:opacity-70">
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-[15px] font-semibold', cancelada && 'line-through')}>{l.descricao}</p>
                      <p className="truncate text-[13px] text-suave">{l.detalhe}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tipo-dado text-[15px]">{formatarMoeda(l.valor)}</p>
                      <p className="tipo-dado text-[12px] text-suave">vence {data(l.vencimento)}</p>
                    </div>
                  </Link>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <Badge tom={situacao.tom} ponto>
                      {l.status === 'quitada' && l.quitadaEm ? `${situacao.rotulo} ${formatarDataCurta(l.quitadaEm)}` : situacao.rotulo}
                    </Badge>
                    <div className="flex gap-1.5">{botoes(l, false)}</div>
                  </div>
                </li>
              )
            })}
          </ListaMobile>
          <Table somenteDesktop>
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
              {lancamentos.map((l) => {
                const situacao = situacoes[l.situacao] ?? situacoes.em_dia
                const cancelada = l.status === 'cancelada'
                return (
                  <TR key={l.id} className={cn(cancelada && 'opacity-50')}>
                    <TD>
                      <Link href={l.hrefEditar} className={cn('font-semibold hover:text-volt-700', cancelada && 'line-through')}>
                        {l.descricao}
                      </Link>
                      <p className="text-[13px] text-suave">{l.detalhe}</p>
                    </TD>
                    <TD className="tipo-dado text-[13px] whitespace-nowrap">{data(l.vencimento)}</TD>
                    <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(l.valor)}</TD>
                    <TD>
                      <Badge tom={situacao.tom} ponto>
                        {situacao.rotulo}
                      </Badge>
                      {l.status === 'quitada' && l.quitadaEm && (
                        <p className="tipo-dado mt-1 text-[11px] text-suave">
                          {prefixoQuitada} {formatarDataCurta(l.quitadaEm)}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">{botoes(l, true)}</div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </>
      )}
    </Card>
  )
}
