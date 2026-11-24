import { Badge } from '@/components/ui/badge'

import { situacaoValidade } from '../validade'

/** Selo colorido da validade: vencido (vermelho), vence em até 30 dias (laranja) ou em dia (verde). */
export function SeloValidade({ validade }: { validade: string }) {
  const { rotulo, tom } = situacaoValidade(validade)
  return (
    <Badge tom={tom} ponto>
      {rotulo}
    </Badge>
  )
}
