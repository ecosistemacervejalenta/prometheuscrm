/**
 * Datas no fuso de Brasília. O Brasil não tem horário de verão desde 2019,
 * então o deslocamento é fixo em -03:00.
 */
export const FUSO = 'America/Sao_Paulo'
const OFFSET = '-03:00'

/** Hoje no formato YYYY-MM-DD (fuso de Brasília). */
export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date())
}

/** Mês atual no formato YYYY-MM. */
export function mesAtual(): string {
  return hojeISO().slice(0, 7)
}

/** Valida "YYYY-MM" e devolve o mês atual se inválido. */
export function mesValido(mes: string | undefined): string {
  return mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : mesAtual()
}

/** Soma (ou subtrai) meses de "YYYY-MM". */
export function somarMeses(mes: string, quantidade: number): string {
  const [ano, m] = mes.split('-').map(Number)
  const data = new Date(Date.UTC(ano, m - 1 + quantidade, 1))
  return data.toISOString().slice(0, 7)
}

/** Primeiro dia do mês: "YYYY-MM" → "YYYY-MM-01". */
export function primeiroDia(mes: string): string {
  return `${mes}-01`
}

/** Soma dias a uma data "YYYY-MM-DD". */
export function somarDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

/** Soma meses a uma data "YYYY-MM-DD", ajustando para o último dia do mês quando preciso. */
export function somarMesesData(dataISO: string, quantidade: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes - 1 + quantidade + 1, 0)).getUTCDate()
  const data = new Date(Date.UTC(ano, mes - 1 + quantidade, Math.min(dia, ultimoDia)))
  return data.toISOString().slice(0, 10)
}

/** Intervalo [início, fim) de um mês como timestamps com fuso de Brasília. */
export function intervaloDoMes(mes: string): { inicio: string; fim: string } {
  return {
    inicio: `${mes}-01T00:00:00${OFFSET}`,
    fim: `${somarMeses(mes, 1)}-01T00:00:00${OFFSET}`,
  }
}

/** Converte "YYYY-MM-DD" em timestamp do início do dia (fuso de Brasília). */
export function inicioDoDia(dataISO: string): string {
  return `${dataISO}T00:00:00${OFFSET}`
}

/** Converte o valor de um <input type="datetime-local"> (horário de Brasília) em ISO. */
export function localParaISO(valor: string | null | undefined): string | null {
  if (!valor) return null
  return new Date(`${valor.length === 16 ? `${valor}:00` : valor}${OFFSET}`).toISOString()
}

/** Converte um timestamp ISO no valor de um <input type="datetime-local"> (horário de Brasília). */
export function isoParaLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`
}

/** Diferença em dias inteiros entre hoje e uma data (positivo = passado). */
export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null
  const hoje = new Date(`${hojeISO()}T12:00:00Z`).getTime()
  const dia = iso.length === 10 ? iso : new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso))
  const data = new Date(`${dia}T12:00:00Z`).getTime()
  return Math.round((hoje - data) / 86_400_000)
}
