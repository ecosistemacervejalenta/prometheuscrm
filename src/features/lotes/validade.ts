import { diasDesde } from '@/lib/datas'
import type { Tom } from '@/lib/rotulos'

export type SituacaoValidade = 'vencido' | 'critico' | 'atencao' | 'alerta' | 'ok'

/**
 * Faixas do painel, da mais urgente para a mais tranquila (a ordem dos cartões e da barra).
 * No dia da validade o lote ainda vale: entra em "Crítico".
 */
export const SITUACOES_VALIDADE: Array<{ chave: SituacaoValidade; rotulo: string; faixa: string; tom: Tom }> = [
  { chave: 'vencido', rotulo: 'Vencidos', faixa: 'Prazo expirado', tom: 'perigo' },
  { chave: 'critico', rotulo: 'Crítico', faixa: 'Até 7 dias', tom: 'alerta' },
  { chave: 'atencao', rotulo: 'Atenção', faixa: '8 a 15 dias', tom: 'vip' },
  { chave: 'alerta', rotulo: 'Alerta', faixa: '16 a 30 dias', tom: 'shopify' },
  { chave: 'ok', rotulo: 'OK', faixa: 'Mais de 30 dias', tom: 'sucesso' },
]

const TONS = Object.fromEntries(SITUACOES_VALIDADE.map((s) => [s.chave, s.tom])) as Record<SituacaoValidade, Tom>

function faixaDe(dias: number): SituacaoValidade {
  if (dias < 0) return 'vencido'
  if (dias <= 7) return 'critico'
  if (dias <= 15) return 'atencao'
  if (dias <= 30) return 'alerta'
  return 'ok'
}

/** Situação de uma validade ("AAAA-MM-DD") hoje, no fuso de Brasília. `dias` = quantos faltam (negativo = vencido). */
export function situacaoValidade(validade: string): { situacao: SituacaoValidade; dias: number; rotulo: string; tom: Tom } {
  const dias = -(diasDesde(validade) ?? 0)
  const situacao = faixaDe(dias)
  const rotulo =
    dias < -1 ? `Vencido há ${-dias} dias` : dias === -1 ? 'Venceu ontem' : dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`
  return { situacao, dias, rotulo, tom: TONS[situacao] }
}
