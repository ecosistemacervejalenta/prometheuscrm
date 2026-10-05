import 'server-only'

import type { IdCanal } from './canais'
import type { Intervalo } from './periodos'

export type Vendas = { valor: number; pedidos: number }

/**
 * Vendas por canal vindas do ERP.
 *
 * AGUARDANDO A DOCUMENTAÇÃO DA API DO ERP. Enquanto a integração não existir,
 * devolve `null` e o painel mostra esses canais como "aguardando ERP".
 *
 * Ao implementar: autenticar (credenciais em env.server.ts, nunca no cliente),
 * buscar os pedidos do intervalo (datas inclusivas, fuso de Brasília), ignorar
 * cancelados/devolvidos e somar valor e quantidade de pedidos por canal
 * (mercado_livre, shopee, shopify). Lançar erro em falha de rede/autenticação:
 * o painel mostra "erro no ERP" sem derrubar a página.
 */
export async function vendasDoErp(intervalo: Intervalo): Promise<Partial<Record<IdCanal, Vendas>> | null> {
  void intervalo
  return null
}
