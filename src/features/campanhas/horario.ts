import { FUSO, somarDias } from '@/lib/datas'
import { formatarDataHora } from '@/lib/format'

/**
 * Horário de envio depois da aprovação da Meta (ex.: "sai às 15:00").
 * A Meta aprova a qualquer hora — até às 23h. Com um horário escolhido, a campanha:
 *   • aprovada antes do horário  → fica agendada para hoje no horário;
 *   • aprovada depois do horário → fica para o próximo horário e a equipe escolhe
 *     se envia agora ou mantém (sem resposta, sai no próximo horário).
 * A campanha agendada (dia e hora) segue a mesma regra quando a Meta aprova depois da hora marcada.
 */

/** Horário sugerido para campanhas novas. */
export const HORARIO_PADRAO = '15:00'

export const REGEX_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/

/** "15:00:00" (coluna time do banco) ou "15:00" → "15:00". */
export function rotuloHorario(horario: string | null | undefined): string | null {
  return horario ? horario.slice(0, 5) : null
}

/** Dia "YYYY-MM-DD" de um instante, no fuso de Brasília. */
function diaEmBrasilia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d)
}

/** Hora "HH:MM" de um instante, no fuso de Brasília. */
export function horaEmBrasilia(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** Instante (ISO) do horário "HH:MM" no dia "YYYY-MM-DD" de Brasília (sem horário de verão desde 2019). */
function noDia(dia: string, horario: string): string {
  return new Date(`${dia}T${horario}:00-03:00`).toISOString()
}

export type PlanoDeEnvio =
  | { tipo: 'agora' }
  | { tipo: 'agendar'; para: string }
  /** Aprovada depois do horário: fica para o próximo horário, esperando a equipe escolher. */
  | { tipo: 'perguntar'; para: string; horario: string }

/** O que fazer com a campanha no momento em que a Meta aprova a mensagem. */
export function planoAposAprovacao(c: { agendada_para: string | null; horario_envio: string | null }, agora = new Date()): PlanoDeEnvio {
  const horario = rotuloHorario(c.horario_envio) ?? (c.agendada_para ? horaEmBrasilia(c.agendada_para) : null)
  if (!horario) return { tipo: 'agora' }

  const hoje = diaEmBrasilia(agora)
  const pretendido = c.agendada_para ?? noDia(hoje, horario)
  if (new Date(pretendido) > agora) return { tipo: 'agendar', para: pretendido }

  const hojeNoHorario = noDia(hoje, horario)
  const para = new Date(hojeNoHorario) > agora ? hojeNoHorario : noDia(somarDias(hoje, 1), horario)
  return { tipo: 'perguntar', para, horario }
}

/** "hoje às 15:00", "amanhã às 15:00" ou "20/11/2026 às 15:00". */
export function rotuloQuando(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return '—'
  const dia = diaEmBrasilia(new Date(iso))
  const hoje = diaEmBrasilia(agora)
  if (dia === hoje) return `hoje às ${horaEmBrasilia(iso)}`
  if (dia === somarDias(hoje, 1)) return `amanhã às ${horaEmBrasilia(iso)}`
  return formatarDataHora(iso)
}
