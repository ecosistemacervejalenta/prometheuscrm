import 'server-only'

import { envServidor } from '@/lib/env.server'

import type { PedidoRotinaMarketplace, RespostaRotinaMarketplace } from './rotina'

/**
 * A tela e o retorno da autorização não leem a chave secreta nem os tokens: pedem à
 * rotina /api/cron/marketplaces (a única com a chave secreta do Supabase), autenticada
 * com CRON_SECRET — o mesmo padrão das Campanhas e do Olist.
 */
export async function pedirARotinaMarketplaces(site: string, pedido: PedidoRotinaMarketplace): Promise<RespostaRotinaMarketplace> {
  if (!envServidor.cronSecret) return { ok: false, mensagem: 'Configure CRON_SECRET na Vercel para conectar os marketplaces.' }
  try {
    const resposta = await fetch(`${site}/api/cron/marketplaces`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${envServidor.cronSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
      cache: 'no-store',
    })
    const corpo = (await resposta.json().catch(() => null)) as Partial<RespostaRotinaMarketplace> | null
    if (!resposta.ok || typeof corpo?.ok !== 'boolean') {
      console.error('[marketplaces] rotina respondeu', resposta.status, corpo)
      return { ok: false, mensagem: corpo?.mensagem ?? `A rotina recusou o pedido (HTTP ${resposta.status}).` }
    }
    return { ok: corpo.ok, mensagem: corpo.mensagem ?? '' }
  } catch (erro) {
    console.error('[marketplaces] rotina indisponível', erro)
    return { ok: false, mensagem: 'Não foi possível falar com a rotina dos marketplaces. Tente de novo em instantes.' }
  }
}
