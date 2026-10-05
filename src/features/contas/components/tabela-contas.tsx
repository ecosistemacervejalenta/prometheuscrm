import type { ReactNode } from 'react'

import { TabelaLancamentos, type Lancamento } from '@/features/financeiro/components/tabela-lancamentos'
import { SITUACAO_CONTA } from '@/lib/rotulos'
import type { ContaPagarDetalhe } from '@/types'

import { pagarConta, reabrirConta, removerConta } from '../actions'

function paraLancamento(c: ContaPagarDetalhe): Lancamento {
  const id = c.id ?? ''
  const fixa = c.tipo === 'fixa'
  return {
    id,
    descricao: c.descricao ?? '',
    detalhe: [c.categoria, c.fornecedor_nome].filter(Boolean).join(' · '),
    vencimento: c.vencimento,
    valor: c.valor,
    situacao: c.situacao ?? 'em_dia',
    status: c.status === 'paga' ? 'quitada' : c.status === 'cancelada' ? 'cancelada' : 'pendente',
    quitadaEm: c.pago_em,
    hrefEditar: `/contas/${id}/editar`,
    quitar: pagarConta.bind(null, id),
    reabrir: reabrirConta.bind(null, id),
    remover: {
      acao: removerConta.bind(null, id, fixa ? 'fixa' : 'variavel'),
      titulo: fixa ? 'Cancelar neste mês' : 'Excluir',
      confirmar: fixa ? 'Cancelar esta conta fixa apenas neste mês?' : 'Excluir esta conta?',
    },
  }
}

export function TabelaContas({
  titulo,
  descricao,
  contas,
  acoes,
  vazio,
  dataCompleta,
}: {
  titulo: string
  descricao?: string
  contas: ContaPagarDetalhe[]
  acoes?: ReactNode
  vazio?: string
  dataCompleta?: boolean
}) {
  return (
    <TabelaLancamentos
      titulo={titulo}
      descricao={descricao}
      lancamentos={contas.map(paraLancamento)}
      acoes={acoes}
      situacoes={SITUACAO_CONTA}
      rotuloQuitar="Pagar"
      prefixoQuitada="pago"
      vazio={vazio}
      dataCompleta={dataCompleta}
    />
  )
}
