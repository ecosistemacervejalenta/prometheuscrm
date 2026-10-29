import 'server-only'

import { exigirEquipe } from '@/lib/auth'

import { SEM_CONEXAO, type IdMarketplace, type StatusMarketplace } from './canais'

/** Status das conexões com Mercado Livre e Shopee (sem tokens nem chaves), com a sessão do usuário. */
export async function statusMarketplaces(): Promise<Record<IdMarketplace, StatusMarketplace>> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('status_marketplaces')
  if (error) throw error
  const linhas = (data ?? {}) as Partial<Record<IdMarketplace, Partial<StatusMarketplace>>>
  return {
    mercado_livre: { ...SEM_CONEXAO, ...linhas.mercado_livre },
    shopee: { ...SEM_CONEXAO, ...linhas.shopee },
  }
}
