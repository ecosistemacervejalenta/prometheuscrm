import 'server-only'

import { createHmac } from 'node:crypto'
import { after } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { EventoIntegracao, Webhook } from '@/types'

/**
 * Entrega da fila de eventos (tabela eventos_integracao) aos webhooks cadastrados.
 *
 * Contrato da requisição enviada (ex.: para um Webhook node do n8n):
 *   POST {url}
 *   Content-Type: application/json
 *   X-Prometheus-Evento: pedido.criado
 *   X-Prometheus-Entrega: <id do evento — use para idempotência>
 *   X-Prometheus-Assinatura: sha256=<HMAC-SHA256 do corpo com o segredo do webhook>
 *   { "id", "tipo", "criado_em", "dados": {...} }
 */

const MAX_TENTATIVAS = 8
const TIMEOUT_MS = 10_000

export type ResultadoFila = { processados: number; enviados: number; falhas: number; ignorados: number }

export function assinarCorpo(segredo: string, corpo: string): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`
}

function querEvento(webhook: Webhook, tipo: string) {
  return webhook.eventos.includes('*') || webhook.eventos.includes(tipo)
}

/** Atraso exponencial: 1, 2, 4, 8... minutos (máx. 6 h). */
function proximaTentativa(tentativas: number): string {
  const minutos = Math.min(2 ** Math.max(tentativas - 1, 0), 360)
  return new Date(Date.now() + minutos * 60_000).toISOString()
}

export async function enviarParaWebhook(
  webhook: Pick<Webhook, 'url' | 'segredo'>,
  evento: Pick<EventoIntegracao, 'id' | 'tipo' | 'criado_em' | 'payload'>,
): Promise<{ ok: boolean; erro?: string }> {
  const corpo = JSON.stringify({ id: evento.id, tipo: evento.tipo, criado_em: evento.criado_em, dados: evento.payload })
  try {
    const resposta = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Prometheus-CRM/1.0',
        'X-Prometheus-Evento': evento.tipo,
        'X-Prometheus-Entrega': evento.id,
        'X-Prometheus-Assinatura': assinarCorpo(webhook.segredo, corpo),
      },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!resposta.ok) return { ok: false, erro: `HTTP ${resposta.status} em ${webhook.url}` }
    return { ok: true }
  } catch (erro) {
    return { ok: false, erro: `${erro instanceof Error ? erro.message : 'Falha de rede'} em ${webhook.url}` }
  }
}

/** Processa até `limite` eventos pendentes. Seguro para execuções simultâneas. */
export async function processarFilaDeEventos(limite = 50): Promise<ResultadoFila> {
  const db = createAdminClient()
  const agora = new Date().toISOString()
  const resultado: ResultadoFila = { processados: 0, enviados: 0, falhas: 0, ignorados: 0 }

  const { data: candidatos } = await db
    .from('eventos_integracao')
    .select('id')
    .eq('status', 'pendente')
    .lte('proxima_tentativa_em', agora)
    .order('criado_em')
    .limit(limite)

  if (!candidatos?.length) return resultado

  // Reserva os eventos por 2 minutos: outra execução simultânea não os pega.
  const { data: eventos } = await db
    .from('eventos_integracao')
    .update({ proxima_tentativa_em: new Date(Date.now() + 120_000).toISOString() })
    .in('id', candidatos.map((c) => c.id))
    .eq('status', 'pendente')
    .lte('proxima_tentativa_em', agora)
    .select()

  if (!eventos?.length) return resultado

  const { data: webhooks } = await db.from('webhooks').select('*').eq('ativo', true)

  for (const evento of eventos) {
    resultado.processados++
    const destinos = (webhooks ?? []).filter((w) => querEvento(w, evento.tipo))

    if (destinos.length === 0) {
      resultado.ignorados++
      await db
        .from('eventos_integracao')
        .update({ status: 'ignorado', processado_em: new Date().toISOString() })
        .eq('id', evento.id)
      continue
    }

    const envios = await Promise.all(destinos.map((w) => enviarParaWebhook(w, evento)))
    const erros = envios.filter((e) => !e.ok).map((e) => e.erro)

    if (erros.length === 0) {
      resultado.enviados++
      await db
        .from('eventos_integracao')
        .update({ status: 'enviado', processado_em: new Date().toISOString(), ultimo_erro: null })
        .eq('id', evento.id)
    } else {
      resultado.falhas++
      const tentativas = evento.tentativas + 1
      await db
        .from('eventos_integracao')
        .update({
          status: tentativas >= MAX_TENTATIVAS ? 'erro' : 'pendente',
          tentativas,
          ultimo_erro: erros.join(' | ').slice(0, 1000),
          proxima_tentativa_em: proximaTentativa(tentativas),
        })
        .eq('id', evento.id)
    }
  }

  return resultado
}

/**
 * Agenda o processamento da fila para DEPOIS da resposta ao usuário
 * (não atrasa a tela). Use após mutações que geram eventos.
 */
export function agendarProcessamentoDeEventos() {
  if (!process.env.SUPABASE_SECRET_KEY) return
  after(async () => {
    try {
      await processarFilaDeEventos(25)
    } catch (erro) {
      console.error('[eventos] falha ao processar a fila', erro)
    }
  })
}
