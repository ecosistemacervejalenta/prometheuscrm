import 'server-only'

import { after } from 'next/server'

import { envServidor } from '@/lib/env.server'

/**
 * A tela não lê o token da Meta: ela pede à rotina /api/cron/campanhas (a única
 * que usa a chave secreta do Supabase), autenticada com CRON_SECRET — o mesmo
 * padrão da sincronização do Olist.
 */
export type PedidoRotina =
  /** Confere a conexão e atualiza número, qualidade e limite (com PIN, registra o número na API). */
  | { acao: 'verificar'; pin?: string | null }
  /** Manda o modelo da campanha para a análise da Meta (ou reaproveita um já aprovado). */
  | { acao: 'analisar'; campanhaId: string }
  /** Envia a mensagem da campanha para um número de teste. */
  | { acao: 'teste'; campanhaId: string; numero: string; nome: string }

export type RespostaRotina = { ok: boolean; mensagem: string }

const SEM_SEGREDO = 'Configure CRON_SECRET na Vercel para usar o WhatsApp oficial.'

export async function pedirARotina(site: string, pedido: PedidoRotina): Promise<RespostaRotina> {
  if (!envServidor.cronSecret) return { ok: false, mensagem: SEM_SEGREDO }
  try {
    const resposta = await fetch(`${site}/api/cron/campanhas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${envServidor.cronSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
      cache: 'no-store',
    })
    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => null)) as { mensagem?: string; erro?: string } | null
      console.error('[campanhas] rotina respondeu', resposta.status, corpo)
      return { ok: false, mensagem: corpo?.mensagem ?? `A rotina de envio recusou o pedido (${corpo?.erro ?? `HTTP ${resposta.status}`}).` }
    }
    return (await resposta.json()) as RespostaRotina
  } catch (erro) {
    console.error('[campanhas] rotina indisponível', erro)
    return { ok: false, mensagem: 'Não foi possível falar com a rotina de envio. Tente de novo em instantes.' }
  }
}

/**
 * Acorda a rotina de envio em segundo plano, depois de responder a quem chamou.
 * Não espera a rodada terminar (até 4 min): depois de 10 s a ligação é solta e a rotina
 * segue sozinha — a Vercel só cancela uma função quando `supportsCancellation` está ligado.
 */
export function acordarEnvios(site: string) {
  if (!envServidor.cronSecret) return
  const segredo = envServidor.cronSecret
  after(() =>
    fetch(`${site}/api/cron/campanhas`, {
      headers: { Authorization: `Bearer ${segredo}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    }).catch((erro) => {
      if (erro instanceof Error && erro.name === 'TimeoutError') return
      console.error('[campanhas] não foi possível acordar a rotina de envio', erro)
    }),
  )
}
