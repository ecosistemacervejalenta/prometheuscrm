import { Badge } from '@/components/ui/badge'
import { CANAIS, SITUACAO_FRETE, STATUS_PAGAMENTO, STATUS_PEDIDO, STATUS_PRE_VENDA } from '@/lib/rotulos'
import type { CanalVenda, SituacaoCaixa, SituacaoFrete, StatusPagamento, StatusPedido, StatusPreVenda } from '@/types'

export function CanalBadge({ canal }: { canal: CanalVenda | null }) {
  if (!canal) return null
  const { rotulo, tom } = CANAIS[canal]
  return <Badge tom={tom}>{rotulo}</Badge>
}

export function PagamentoBadge({ status }: { status: StatusPagamento | null }) {
  if (!status) return null
  const { rotulo, tom } = STATUS_PAGAMENTO[status]
  return (
    <Badge tom={tom} ponto>
      {rotulo}
    </Badge>
  )
}

export function StatusPedidoBadge({ status }: { status: StatusPedido | null }) {
  if (!status) return null
  const { rotulo, tom } = STATUS_PEDIDO[status]
  return <Badge tom={tom}>{rotulo}</Badge>
}

export function StatusPreVendaBadge({ status }: { status: StatusPreVenda | null }) {
  if (!status) return null
  const { rotulo, tom } = STATUS_PRE_VENDA[status]
  return (
    <Badge tom={tom} ponto>
      {rotulo}
    </Badge>
  )
}

export function FreteBadge({ frete }: { frete: SituacaoFrete | null }) {
  if (!frete) return null
  const { rotulo, tom } = SITUACAO_FRETE[frete]
  return <Badge tom={tom}>{rotulo}</Badge>
}

/** Caixa VIP do link: aberta (cliente ainda montando) ou fechada (para pagar/paga). */
export function CaixaBadge({ caixa }: { caixa: SituacaoCaixa | null }) {
  if (!caixa) return null
  return caixa === 'aberta' ? (
    <Badge tom="vip" ponto>
      Caixa aberta
    </Badge>
  ) : (
    <Badge tom="neutro">Caixa fechada</Badge>
  )
}
