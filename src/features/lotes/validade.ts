import { diasDesde } from '@/lib/datas'
import type { Tom } from '@/lib/rotulos'

/** Lote que vence em até 30 dias aparece como "vence logo". */
export const DIAS_VENCE_LOGO = 30

export type SituacaoValidade = 'vencido' | 'vence_logo' | 'em_dia'

/** Situação de uma validade ("AAAA-MM-DD") hoje, no fuso de Brasília. No dia da validade ainda vale. */
export function situacaoValidade(validade: string): { situacao: SituacaoValidade; dias: number; rotulo: string; tom: Tom } {
  const dias = -(diasDesde(validade) ?? 0)
  if (dias < 0) return { situacao: 'vencido', dias, rotulo: dias === -1 ? 'Venceu ontem' : `Vencido há ${-dias} dias`, tom: 'perigo' }
  if (dias <= DIAS_VENCE_LOGO) {
    const rotulo = dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`
    return { situacao: 'vence_logo', dias, rotulo, tom: 'alerta' }
  }
  return { situacao: 'em_dia', dias, rotulo: 'Em dia', tom: 'sucesso' }
}
