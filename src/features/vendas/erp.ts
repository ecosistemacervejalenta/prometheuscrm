import 'server-only'

import { exigirEquipe } from '@/lib/auth'

import type { IdCanal } from './canais'
import type { Intervalo } from './periodos'

export type Vendas = { valor: number; pedidos: number }

/** Canais do painel que vêm do Olist. Pedidos "API Tiny" e sem e-commerce ficam de fora. */
const CANAIS_DO_ERP: IdCanal[] = ['mercado_livre', 'shopee', 'shopify']

/**
 * Vendas por canal no intervalo (datas inclusivas), a partir dos pedidos do
 * Olist ERP já sincronizados em pedidos_erp. Pedidos cancelados não entram.
 */
export async function vendasDoErp(intervalo: Intervalo): Promise<Partial<Record<IdCanal, Vendas>>> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('vendas_erp_por_canal', { p_inicio: intervalo.inicio, p_fim: intervalo.fim })
  if (error) throw error

  const vendas: Partial<Record<IdCanal, Vendas>> = {}
  for (const linha of data ?? []) {
    const canal = linha.canal as IdCanal
    if (CANAIS_DO_ERP.includes(canal)) vendas[canal] = { valor: Number(linha.valor), pedidos: Number(linha.pedidos) }
  }
  return vendas
}
