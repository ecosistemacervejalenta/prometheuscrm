import 'server-only'

import { processarFilaDeEventos } from '@/features/integracoes/eventos'
import { FUSO, hojeISO } from '@/lib/datas'
import { formatarData, formatarDataHora, formatarNumero } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types'

/**
 * Avisos de validade no grupo da equipe. Quem fala com o grupo é o n8n (fluxo "Cerveja Lenta -
 * Validade dos lotes"): o CRM manda o evento pela fila de webhooks com a mensagem pronta e o
 * botão "Registrar tratativa".
 */

/** Os avisos automáticos só saem neste horário (Brasília); o que vencer de madrugada sai às 8h. */
export const HORARIO_AVISOS = { inicio: 8, fim: 20 }

export type FaixaAviso = 'alerta' | 'atencao' | 'critico'

export const FAIXAS_AVISO: Record<FaixaAviso, { rotulo: string; descricao: string; emoji: string }> = {
  alerta: { rotulo: 'Alerta', descricao: 'vence em 16 a 30 dias', emoji: '🔵' },
  atencao: { rotulo: 'Atenção', descricao: 'vence em 8 a 15 dias', emoji: '🟡' },
  critico: { rotulo: 'Crítico', descricao: 'vence em até 7 dias', emoji: '🔴' },
}

export type DadosDoAviso = {
  id: string
  cerveja_nome: string
  lote: string
  validade: string
  quantidade: number | null
  faixa: string
  teste: boolean
}

/** Dias que faltam hoje (Brasília) para a validade. */
export function diasParaVencer(validade: string): number {
  const hoje = new Date(`${hojeISO()}T12:00:00Z`).getTime()
  return Math.round((new Date(`${validade}T12:00:00Z`).getTime() - hoje) / 86_400_000)
}

/** "vence hoje" / "vence amanhã" / "vence em 5 dias" / "venceu há 2 dias" (com negrito do WhatsApp). */
export function venceTexto(dias: number, negrito = true): string {
  const b = (t: string) => (negrito ? `*${t}*` : t)
  if (dias < -1) return `venceu há ${b(`${-dias} dias`)}`
  if (dias === -1) return `venceu ${b('ontem')}`
  if (dias === 0) return `vence ${b('hoje')}`
  if (dias === 1) return `vence ${b('amanhã')}`
  return `vence em ${b(`${dias} dias`)}`
}

export function linkDaTratativa(site: string, alertaId: string) {
  return `${site}/lotes/tratativa/${alertaId}`
}

const faixaDe = (faixa: string) => FAIXAS_AVISO[faixa as FaixaAviso] ?? FAIXAS_AVISO.alerta

/** Evento lote.alerta_validade: mensagem pronta para o grupo e o botão da tratativa. */
export function eventoDoAviso(aviso: DadosDoAviso, site: string): Json {
  const dias = diasParaVencer(aviso.validade)
  const faixa = faixaDe(aviso.faixa)
  const link = linkDaTratativa(site, aviso.id)
  const linhas = [
    aviso.teste ? '🧪 *MENSAGEM DE TESTE* — pode ignorar\n' : null,
    '⚠️ *Atenção, grupo!*',
    '',
    `A cerveja *${aviso.cerveja_nome}* ${venceTexto(dias)} e precisa de uma tratativa urgente.`,
    '',
    `🍺 Lote: ${aviso.lote}`,
    `📅 Validade: ${formatarData(aviso.validade)}`,
    `📦 Unidades do lote: ${aviso.quantidade === null ? 'não informada' : formatarNumero(aviso.quantidade)}`,
    `${faixa.emoji} Situação: ${faixa.rotulo} (${faixa.descricao})`,
    '',
    `👉 Registre a tratativa: ${link}`,
  ].filter((l): l is string => l !== null)
  return {
    mensagem: linhas.join('\n'),
    botao: { texto: 'Registrar tratativa', url: link },
    teste: aviso.teste,
    alerta: {
      id: aviso.id,
      cerveja: aviso.cerveja_nome,
      lote: aviso.lote,
      validade: aviso.validade,
      dias,
      quantidade: aviso.quantidade,
      faixa: aviso.faixa,
      faixa_rotulo: faixa.rotulo,
      link_tratativa: link,
    },
  }
}

/** Evento lote.tratativa_registrada: confirmação no grupo (quem tratou, quando e o que fez). */
export function eventoDaTratativa(aviso: DadosDoAviso, tratativa: { autor: string; texto: string; criado_em: string }): Json {
  const dias = diasParaVencer(aviso.validade)
  const linhas = [
    aviso.teste ? '🧪 *MENSAGEM DE TESTE* — pode ignorar\n' : null,
    '✅ *Tratativa registrada*',
    '',
    `🍺 ${aviso.cerveja_nome} · lote ${aviso.lote} (${venceTexto(dias, false)}, ${formatarData(aviso.validade)})`,
    `👤 Tratado por *${tratativa.autor}* em ${formatarDataHora(tratativa.criado_em)}`,
    `📝 ${tratativa.texto}`,
  ].filter((l): l is string => l !== null)
  return {
    mensagem: linhas.join('\n'),
    teste: aviso.teste,
    alerta: { id: aviso.id, cerveja: aviso.cerveja_nome, lote: aviso.lote, validade: aviso.validade, dias, faixa: aviso.faixa },
    tratativa: { autor: tratativa.autor, texto: tratativa.texto, criado_em: tratativa.criado_em },
  }
}

/** Hora cheia agora em Brasília (0–23). */
function horaDeBrasilia(): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
}

export type ResultadoAvisos = { criados: number; enfileirados: number; foraDoHorario: boolean }

/**
 * Rotina (a cada 5 min, dentro do horário): cria os avisos dos lotes que mudaram de faixa,
 * manda cada um (e algum que tenha ficado para trás) para a fila de webhooks e entrega ao n8n.
 */
export async function processarAvisosDeValidade(site: string): Promise<ResultadoAvisos> {
  const hora = horaDeBrasilia()
  if (hora < HORARIO_AVISOS.inicio || hora >= HORARIO_AVISOS.fim) return { criados: 0, enfileirados: 0, foraDoHorario: true }

  const supabase = createAdminClient()
  const { data: criados, error } = await supabase.rpc('gerar_alertas_de_validade')
  if (error) throw error

  // Avisos ainda sem evento (os de agora e algum que falhou ao entrar na fila).
  const { data: semEvento } = await supabase
    .from('lote_alertas')
    .select('id, cerveja_nome, lote, validade, quantidade, faixa, teste')
    .is('evento_id', null)
    .eq('teste', false)
    .gte('criado_em', new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order('criado_em')
    .limit(50)

  let enfileirados = 0
  for (const aviso of semEvento ?? []) {
    const { error: erroFila } = await supabase.rpc('enfileirar_aviso_lote', {
      p_tipo: 'lote.alerta_validade',
      p_alerta_id: aviso.id,
      p_tratativa_id: null,
      p_payload: eventoDoAviso(aviso, site),
    })
    if (erroFila) console.error('[lotes] aviso para a fila', erroFila.message)
    else enfileirados++
  }
  if (enfileirados) await processarFilaDeEventos(25)
  return { criados: criados?.length ?? 0, enfileirados, foraDoHorario: false }
}
