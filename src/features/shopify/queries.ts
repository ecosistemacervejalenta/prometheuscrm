import 'server-only'

import { exigirEquipe } from '@/lib/auth'

export type StatusShopify = {
  conectado: boolean
  loja: string | null
  loja_nome: string | null
  client_id: string | null
  escopos: string | null
  conectado_em: string | null
  verificado_em: string | null
  cotacao_em: string | null
  ultimo_erro: string | null
  fretes_calculados: number
}

const SEM_CONEXAO: StatusShopify = {
  conectado: false,
  loja: null,
  loja_nome: null,
  client_id: null,
  escopos: null,
  conectado_em: null,
  verificado_em: null,
  cotacao_em: null,
  ultimo_erro: null,
  fretes_calculados: 0,
}

/** Status da conexão que calcula o frete (sem secret nem token), com a sessão do usuário. */
export async function statusShopify(): Promise<StatusShopify> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('status_shopify')
  // Sem a migration aplicada o CRM continua funcionando (como "desconectado").
  if (error) {
    console.error('[shopify] status', error.message)
    return SEM_CONEXAO
  }
  return { ...SEM_CONEXAO, ...((data ?? {}) as Partial<StatusShopify>) }
}
