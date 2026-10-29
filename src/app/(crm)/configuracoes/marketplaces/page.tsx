import type { Metadata } from 'next'

import { Alert } from '@/components/ui/alert'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'
import { AVISOS_MARKETPLACE, MARKETPLACES, marketplaceDoSlug } from '@/features/marketplaces/canais'
import { CartaoMarketplace } from '@/features/marketplaces/components/cartao-marketplace'
import { GuiaMercadoLivre } from '@/features/marketplaces/components/guia-mercado-livre'
import { GuiaShopee } from '@/features/marketplaces/components/guia-shopee'
import { statusMarketplaces } from '@/features/marketplaces/queries'
import { exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Marketplaces' }

export default async function PaginaMarketplaces({ searchParams }: PageProps<'/configuracoes/marketplaces'>) {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const busca = await searchParams
  const canalDoAviso = marketplaceDoSlug(param(busca.marketplace) ?? '')
  const aviso = canalDoAviso ? AVISOS_MARKETPLACE[param(busca.status) ?? ''] : undefined
  const [status, site] = await Promise.all([statusMarketplaces(), urlDoSite()])

  return (
    <>
      <CabecalhoConfiguracoes ativa="marketplaces" />
      <div className="space-y-5 lg:space-y-6">
        {aviso && canalDoAviso && <Alert tom={aviso.tom}>{aviso.texto(MARKETPLACES[canalDoAviso].nome)}</Alert>}

        <Alert tom="info" titulo="Para que serve">
          O Olist já traz quanto cada canal vendeu. Ligando o Mercado Livre e a Shopee direto aqui, o CRM passa a ler também as
          tarifas, o frete e o valor que realmente cai na conta de cada venda — a base para mostrar quanto sobra em cada canal.
          Somente leitura: nada é alterado nos anúncios.
        </Alert>

        <section aria-labelledby="titulo-mercado-livre" className="space-y-4">
          <h2 id="titulo-mercado-livre" className="tipo-h3">
            Mercado Livre
          </h2>
          <CartaoMarketplace
            canal="mercado_livre"
            status={status.mercado_livre}
            descricao="Tarifa de venda, frete e valor líquido de cada pedido, direto da API do Mercado Livre."
            ehAdmin={ehAdmin}
          />
          <GuiaMercadoLivre status={status.mercado_livre} site={site} />
        </section>

        <section aria-labelledby="titulo-shopee" className="space-y-4 pt-2">
          <h2 id="titulo-shopee" className="tipo-h3">
            Shopee
          </h2>
          <CartaoMarketplace
            canal="shopee"
            status={status.shopee}
            descricao="Comissão, taxas, frete e o repasse final de cada pedido, pela Shopee Open Platform."
            ehAdmin={ehAdmin}
          />
          <GuiaShopee status={status.shopee} site={site} />
        </section>
      </div>
    </>
  )
}
