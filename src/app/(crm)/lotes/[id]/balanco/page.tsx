import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { lancarBalanco } from '@/features/lotes/actions'
import { TelaDoBalanco } from '@/features/lotes/components/tela-do-balanco'
import { caixaVipDoProduto, estoqueAgoraNaOlist, obterCervejaDosLotes } from '@/features/lotes/queries'

export const metadata: Metadata = { title: 'Balanço de estoque' }

/** Balanço de estoque de uma cerveja do controle: a contagem por lote vira o estoque dela na Olist. */
export default async function PaginaBalancoDaCerveja({ params }: PageProps<'/lotes/[id]/balanco'>) {
  const { id } = await params
  const cerveja = await obterCervejaDosLotes(id)
  if (!cerveja) notFound()
  const [agora, caixaVip] = await Promise.all([estoqueAgoraNaOlist(cerveja.olist_id), caixaVipDoProduto(cerveja.olist_id)])
  const ultimaLeitura = cerveja.estoque_olist === null ? null : Math.floor(cerveja.estoque_olist)

  return (
    <TelaDoBalanco
      nome={cerveja.nome}
      sku={cerveja.sku}
      foto={cerveja.foto_url}
      estoqueOlist={agora.lidoAgora ? agora.estoque : ultimaLeitura}
      lidoAgora={agora.lidoAgora}
      nosLotes={cerveja.nosLotes}
      lotes={cerveja.lotes.map(({ id: loteId, lote, validade, quantidade }) => ({ id: loteId, lote, validade, quantidade }))}
      caixaVip={caixaVip}
      acao={lancarBalanco.bind(null, id)}
      voltar={{ href: `/lotes/${id}`, rotulo: cerveja.nome }}
      noControle
    />
  )
}
