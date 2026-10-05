import 'server-only'

import { envServidor } from '@/lib/env.server'

import type { ResultadoSincronizacao } from './sincronizacao'

/** Minutos após os quais a Visão geral pede uma nova sincronização em segundo plano. */
export const MINUTOS_PARA_DESATUALIZAR = 15

/**
 * Pede uma sincronização à rota /api/cron/olist (a única que usa a chave secreta).
 * Usado pelo botão "Atualizar", pelo callback do OAuth e pela Visão geral.
 */
export async function dispararSincronizacao(site: string): Promise<ResultadoSincronizacao | null> {
  if (!envServidor.cronSecret) return null
  try {
    const resposta = await fetch(`${site}/api/cron/olist`, {
      headers: { Authorization: `Bearer ${envServidor.cronSecret}` },
      cache: 'no-store',
    })
    return (await resposta.json()) as ResultadoSincronizacao
  } catch (erro) {
    console.error('[olist] não foi possível disparar a sincronização', erro)
    return null
  }
}

export function sincronizacaoDesatualizada(ultimaSincronizacao: string | null): boolean {
  if (!ultimaSincronizacao) return true
  return Date.now() - new Date(ultimaSincronizacao).getTime() > MINUTOS_PARA_DESATUALIZAR * 60_000
}
