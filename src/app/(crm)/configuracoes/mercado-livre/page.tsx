import type { Metadata } from 'next'

import { AlertasGrupoMercadoLivre } from '@/features/marketplaces/components/alertas-grupo-ml'
import { GuiaMercadoLivre } from '@/features/marketplaces/components/guia-mercado-livre'
import { SecaoMarketplace } from '@/features/marketplaces/components/secao-marketplace'
import { statusMarketplaces, ultimosAlertasMercadoLivre } from '@/features/marketplaces/queries'
import { exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Mercado Livre' }

export default async function PaginaMercadoLivre({ searchParams }: PageProps<'/configuracoes/mercado-livre'>) {
  const { perfil } = await exigirEquipe()
  const [status, site, busca, alertas] = await Promise.all([statusMarketplaces(), urlDoSite(), searchParams, ultimosAlertasMercadoLivre()])

  return (
    <SecaoMarketplace
      canal="mercado_livre"
      status={status.mercado_livre}
      descricao="Tarifa de venda, frete e valor líquido de cada pedido, direto da API do Mercado Livre — e alertas de pergunta, mensagem e reclamação no grupo da equipe."
      ehAdmin={perfil.papel === 'admin'}
      retorno={param(busca.status)}
      extra={<AlertasGrupoMercadoLivre alertas={alertas} conectado={status.mercado_livre.conectado} />}
      guia={<GuiaMercadoLivre status={status.mercado_livre} site={site} />}
    />
  )
}
