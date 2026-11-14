import type { Metadata } from 'next'

import { GuiaShopee } from '@/features/marketplaces/components/guia-shopee'
import { SecaoMarketplace } from '@/features/marketplaces/components/secao-marketplace'
import { statusMarketplaces } from '@/features/marketplaces/queries'
import { exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Shopee' }

export default async function PaginaShopee({ searchParams }: PageProps<'/configuracoes/shopee'>) {
  const { perfil } = await exigirEquipe()
  const [status, site, busca] = await Promise.all([statusMarketplaces(), urlDoSite(), searchParams])

  return (
    <SecaoMarketplace
      canal="shopee"
      status={status.shopee}
      descricao="Comissão, taxas, frete e o repasse final de cada pedido, pela Shopee Open Platform."
      ehAdmin={perfil.papel === 'admin'}
      retorno={param(busca.status)}
      guia={<GuiaShopee status={status.shopee} site={site} />}
    />
  )
}
