import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { RefreshCw, SearchX } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { lancarBalancoDeCervejaNova } from '@/features/lotes/actions'
import { TelaDoBalanco } from '@/features/lotes/components/tela-do-balanco'
import { caixaVipDoProduto, previaDaCervejaDaOlist } from '@/features/lotes/queries'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Balanço de estoque' }

/**
 * Balanço de uma cerveja que ainda não está no controle (vem da prévia da busca): por exemplo,
 * mercadoria nova, com estoque zerado na Olist. Abrir esta tela não grava nada; ao enviar o
 * balanço, a cerveja entra no controle e os lotes informados viram o estoque dela na Olist.
 */
export default async function PaginaBalancoDeCervejaNova({ searchParams }: PageProps<'/lotes/novo/balanco'>) {
  const busca = await searchParams
  const olistId = Number(param(busca.produto))
  const codigo = (param(busca.codigo) ?? '').slice(0, 60)
  if (!Number.isSafeInteger(olistId) || olistId <= 0) redirect('/lotes')
  const endereco = new URLSearchParams({ produto: String(olistId), codigo })

  const previa = await previaDaCervejaDaOlist(olistId)
  if (previa.tipo === 'no-controle') redirect(`/lotes/${previa.id}/balanco`)
  if (previa.tipo === 'erro') {
    return (
      <>
        <PageHeader titulo="Balanço de estoque" voltar={{ href: '/lotes', rotulo: 'Lotes e validades' }} />
        <Card>
          <EmptyState
            icone={SearchX}
            titulo="Não deu para ler a cerveja na Olist"
            descricao={previa.mensagem}
            acao={
              <ButtonLink href={`/lotes/novo/balanco?${endereco}`}>
                <RefreshCw /> Tentar de novo
              </ButtonLink>
            }
          />
        </Card>
      </>
    )
  }

  const { produto } = previa
  const caixaVip = await caixaVipDoProduto(olistId)
  return (
    <TelaDoBalanco
      nome={produto.nome}
      sku={produto.sku}
      foto={produto.foto}
      estoqueOlist={produto.estoque === null ? null : Math.floor(produto.estoque)}
      lidoAgora
      nosLotes={null}
      lotes={[]}
      caixaVip={caixaVip}
      acao={lancarBalancoDeCervejaNova.bind(null, olistId, codigo)}
      voltar={{ href: `/lotes/novo?${endereco}`, rotulo: produto.nome }}
      noControle={false}
    />
  )
}
