import { TrendingUp } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { GraficoEvolucao } from '@/features/vendas/components/grafico-evolucao'
import type { Intervalo } from '@/features/vendas/periodos'
import { montarSerie, type VendasPorCanal } from '@/features/vendas/serie'

import type { ResumoInfluenciadores } from '../rotulos'

/**
 * Evolução das vendas com cupom no período (por dia; acima de 45 dias, por semana).
 * Reaproveita o gráfico do painel de vendas: mesma leitura, tooltip e alternância Faturamento/Pedidos.
 */
export function GraficoDeVendas({
  serie,
  intervalo,
  vazio = 'Quando um pedido usar um cupom neste período, a evolução aparece aqui.',
}: {
  serie: ResumoInfluenciadores['serie']
  intervalo: Intervalo
  vazio?: string
}) {
  if (!serie.some((p) => p.pedidos > 0)) {
    return <EmptyState icone={TrendingUp} titulo="Sem vendas com cupom no período" descricao={vazio} />
  }

  // O gráfico é por "canal": aqui há uma linha só, a das vendas com cupom na loja.
  const porDia = new Map<string, VendasPorCanal>(serie.map((p) => [p.dia, { shopify: { valor: p.vendido, pedidos: p.pedidos } }]))
  const { pontos, granularidade } = montarSerie(intervalo, porDia)

  return <GraficoEvolucao pontos={pontos} granularidade={granularidade} canais={[{ id: 'shopify', nome: 'Vendas com cupom', cor: 'var(--color-volt-700)' }]} />
}
