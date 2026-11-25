import { formatarDataHora, formatarHaQuanto } from '@/lib/format'

/**
 * Leitura automática do estoque das cervejas na Olist (rotina /api/cron/olist-estoque, a cada
 * 5 min). Em cada rodada lê só as cervejas com a leitura mais antiga, poucas por vez e uma de
 * cada vez, para nunca passar do limite da Olist (~3 chamadas por segundo e 60 por minuto, que
 * as pré-vendas também usam).
 */

/** Uma cerveja é relida quando a última leitura passa disto. */
export const RELER_A_CADA_MIN = 30
/** "a cada 30 min" / "a cada 1 h" — o texto que a tela mostra. */
export const FREQUENCIA_LEITURA = `a cada ${RELER_A_CADA_MIN % 60 === 0 ? `${RELER_A_CADA_MIN / 60} h` : `${RELER_A_CADA_MIN} min`}`
/** Cervejas lidas por rodada (a rotina roda a cada 5 min: até 120 cervejas por hora). */
export const CERVEJAS_POR_RODADA = 10
/** Pausa entre uma cerveja e a próxima, dentro da rodada. */
export const PAUSA_ENTRE_LEITURAS_MS = 500
/** Passou disto sem ler: a leitura está atrasada (a Olist recusou, desconectou...). */
export const ATRASADA_MIN = 3 * 60

export type ResumoLeituras = {
  /** Leitura mais recente entre todas as cervejas. */
  ultima: string | null
  /** Cervejas sem leitura há mais de ATRASADA_MIN (ou nunca lidas). */
  atrasadas: number
}

export function resumoLeituras(cervejas: Array<{ estoque_lido_em: string | null }>): ResumoLeituras {
  const lidas = cervejas.map((c) => c.estoque_lido_em).filter((d): d is string => Boolean(d))
  const limite = Date.now() - ATRASADA_MIN * 60_000
  return {
    ultima: lidas.length ? lidas.reduce((a, b) => (a > b ? a : b)) : null,
    atrasadas: cervejas.filter((c) => !c.estoque_lido_em || new Date(c.estoque_lido_em).getTime() < limite).length,
  }
}

/** "25/11/2026 às 10:03 (há 3 min)" — o "há" só nas últimas 24 h. */
export function quandoLeu(iso: string): string {
  const ha = formatarHaQuanto(iso)
  return ha.startsWith('há') || ha === 'agora' ? `${formatarDataHora(iso)} (${ha})` : formatarDataHora(iso)
}
