import 'server-only'

import { after } from 'next/server'

import { envServidor } from '@/lib/env.server'
import { urlDoSite } from '@/lib/url'

import { statusOlist } from './queries'
import type { ModoSincronizacao, ResultadoSincronizacao } from './sincronizacao'

/** Dados do Olist mais velhos que isso são atualizados antes de aparecer na Visão geral. */
export const MINUTOS_PARA_DESATUALIZAR = 10
/** Tempo máximo que a Visão geral espera a atualização (depois segue com o último dado bom). */
const ESPERA_MAXIMA_MS = 8000

/**
 * Pede uma sincronização à rota /api/cron/olist (a única que usa a chave secreta).
 * Usado pelo botão "Atualizar", pelo callback do OAuth e pela Visão geral.
 */
export async function dispararSincronizacao(site: string, modo: ModoSincronizacao = 'rapida'): Promise<ResultadoSincronizacao | null> {
  if (!envServidor.cronSecret) return null
  try {
    const resposta = await fetch(`${site}/api/cron/olist?modo=${modo}`, {
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

/**
 * Antes de mostrar os números à diretoria: se a última sincronização tem mais de
 * 10 min, atualiza (modo rápido) e espera até 8 s. Se passar disso, a tela segue
 * com o último dado bom e a sincronização termina em segundo plano.
 */
export async function garantirDadosRecentesDoOlist(): Promise<void> {
  const status = await statusOlist().catch(() => null)
  if (!status?.conectado || !status.sincronizacaoDisponivel || !sincronizacaoDesatualizada(status.ultimaSincronizacao)) return

  const promessa = dispararSincronizacao(await urlDoSite(), 'rapida')
  const resultado = await Promise.race([
    promessa,
    new Promise<'tempo'>((resolver) => setTimeout(() => resolver('tempo'), ESPERA_MAXIMA_MS)),
  ])
  if (resultado === 'tempo') after(() => promessa)
}
