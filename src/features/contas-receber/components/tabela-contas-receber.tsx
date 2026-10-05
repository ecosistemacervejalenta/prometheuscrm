import type { ReactNode } from 'react'

import { TabelaLancamentos, type Lancamento } from '@/features/financeiro/components/tabela-lancamentos'
import { SITUACAO_RECEBIMENTO } from '@/lib/rotulos'
import type { ContaReceberDetalhe } from '@/types'

import { excluirContaReceber, reabrirContaReceber, receberConta } from '../actions'

function paraLancamento(c: ContaReceberDetalhe): Lancamento {
  const id = c.id ?? ''
  return {
    id,
    descricao: c.descricao ?? '',
    detalhe: [c.categoria, c.pagador].filter(Boolean).join(' · '),
    vencimento: c.vencimento,
    valor: c.valor,
    situacao: c.situacao ?? 'em_dia',
    status: c.status === 'recebida' ? 'quitada' : c.status === 'cancelada' ? 'cancelada' : 'pendente',
    quitadaEm: c.recebido_em,
    hrefEditar: `/receber/${id}/editar`,
    quitar: receberConta.bind(null, id),
    reabrir: reabrirContaReceber.bind(null, id),
    remover: { acao: excluirContaReceber.bind(null, id), titulo: 'Excluir', confirmar: 'Excluir esta conta a receber?' },
  }
}

export function TabelaContasReceber({
  titulo,
  descricao,
  contas,
  acoes,
  dataCompleta,
}: {
  titulo: string
  descricao?: string
  contas: ContaReceberDetalhe[]
  acoes?: ReactNode
  dataCompleta?: boolean
}) {
  return (
    <TabelaLancamentos
      titulo={titulo}
      descricao={descricao}
      lancamentos={contas.map(paraLancamento)}
      acoes={acoes}
      situacoes={SITUACAO_RECEBIMENTO}
      rotuloQuitar="Receber"
      prefixoQuitada="recebido"
      vazio="Nenhuma conta a receber neste mês."
      dataCompleta={dataCompleta}
    />
  )
}
