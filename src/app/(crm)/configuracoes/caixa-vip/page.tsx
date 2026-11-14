import type { Metadata } from 'next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Pilha } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { FormularioCaixaVip } from '@/features/configuracoes/components/formularios'
import { obterConfiguracoes } from '@/features/configuracoes/queries'

export const metadata: Metadata = { title: 'Caixa VIP' }

const REGRAS = [
  'O prazo é contado da última compra, do fechamento da caixa ou da última cobrança.',
  'Caixa com PIX em aberto, paga ou com parte paga não é cancelada.',
  'Ao cancelar, as cervejas voltam ao estoque (inclusive na Olist).',
]

export default async function PaginaCaixaVip() {
  const config = await obterConfiguracoes()

  return (
    <>
      <CabecalhoSecao secao="caixa-vip" />
      <Pilha estreita>
        <FormularioCaixaVip config={config} />
        <Card>
          <CardHeader titulo="Como o prazo é aplicado" />
          <CardContent>
            <ul className="space-y-2.5 text-sm">
              {REGRAS.map((regra) => (
                <li key={regra} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
                  <span>{regra}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Pilha>
    </>
  )
}
