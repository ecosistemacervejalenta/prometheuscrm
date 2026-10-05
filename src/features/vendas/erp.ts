import 'server-only'

import { exigirEquipe } from '@/lib/auth'

import type { IdCanal } from './canais'
import type { Intervalo } from './periodos'
import type { VendasPorCanal } from './serie'

export type { Vendas } from './serie'

/** Canais do painel que vêm do Olist. Pedidos de outros e-commerces e sem e-commerce ficam de fora. */
const CANAIS_DO_ERP: IdCanal[] = ['mercado_livre', 'shopee', 'shopify']
const doErp = (canal: string): canal is IdCanal => CANAIS_DO_ERP.includes(canal as IdCanal)

/**
 * Vendas por canal no intervalo (datas inclusivas), a partir dos pedidos do Olist
 * sincronizados. O critério de situação é o do Olist e fica no banco
 * (situacao_erp_conta_venda): não conta Aberta, Cancelada e Dados incompletos.
 */
export async function vendasDoErp(intervalo: Intervalo): Promise<VendasPorCanal> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('vendas_erp_por_canal', { p_inicio: intervalo.inicio, p_fim: intervalo.fim })
  if (error) throw error

  const vendas: VendasPorCanal = {}
  for (const linha of data ?? []) {
    if (doErp(linha.canal)) vendas[linha.canal] = { valor: Number(linha.valor), pedidos: Number(linha.pedidos) }
  }
  return vendas
}

/** Mesmas vendas, dia a dia ("AAAA-MM-DD" → vendas por canal), para o gráfico de evolução. */
export async function vendasDoErpPorDia(intervalo: Intervalo): Promise<Map<string, VendasPorCanal>> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('vendas_erp_por_dia', { p_inicio: intervalo.inicio, p_fim: intervalo.fim })
  if (error) throw error

  const porDia = new Map<string, VendasPorCanal>()
  for (const linha of data ?? []) {
    if (!doErp(linha.canal)) continue
    const dia = String(linha.dia).slice(0, 10)
    const vendas = porDia.get(dia) ?? {}
    vendas[linha.canal] = { valor: Number(linha.valor), pedidos: Number(linha.pedidos) }
    porDia.set(dia, vendas)
  }
  return porDia
}
