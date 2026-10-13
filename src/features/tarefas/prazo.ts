import { diasDesde } from '@/lib/datas'
import { formatarDataCurta, formatarHora } from '@/lib/format'
import type { StatusTarefa } from '@/types'

export type TomPrazo = 'perigo' | 'alerta' | 'neutro' | 'sutil' | 'sucesso'

/**
 * Como mostrar o prazo no cartão:
 *   aberta   → Atrasada · 12 out 18:00 | Hoje 18:00 | Amanhã 09:00 | 15 out 14:00 | Sem prazo
 *   concluída → Entregue 12 out | Entregue com atraso
 */
export function descreverPrazo(t: {
  prazo: string | null
  status: StatusTarefa
  atrasada: boolean
  concluida_em: string | null
}): { texto: string; tom: TomPrazo } {
  if (t.status === 'concluida') {
    const comAtraso = Boolean(t.prazo && t.concluida_em && Date.parse(t.concluida_em) > Date.parse(t.prazo))
    if (comAtraso) return { texto: 'Entregue com atraso', tom: 'alerta' }
    return { texto: t.concluida_em ? `Entregue ${formatarDataCurta(t.concluida_em)}` : 'Entregue', tom: 'sucesso' }
  }
  if (!t.prazo) return { texto: 'Sem prazo', tom: 'sutil' }

  const hora = formatarHora(t.prazo)
  if (t.atrasada) return { texto: `Atrasada · ${formatarDataCurta(t.prazo)} ${hora}`, tom: 'perigo' }
  const dias = diasDesde(t.prazo)
  if (dias === 0) return { texto: `Hoje ${hora}`, tom: 'alerta' }
  if (dias === -1) return { texto: `Amanhã ${hora}`, tom: 'neutro' }
  return { texto: `${formatarDataCurta(t.prazo)} ${hora}`, tom: 'neutro' }
}

/** "Raphael Henrique Martins dos Santos" → "Raphael Santos" (cabe no cartão e diferencia xarás). */
export function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : (partes[0] ?? '')
}
