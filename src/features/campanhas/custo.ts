/**
 * Custo das campanhas: a Meta cobra por mensagem de marketing ENTREGUE, pelo país do contato.
 *
 * O preço vem da própria conta: a rotina divide o custo pelo volume do último dia com marketing
 * para o Brasil (pricing_analytics) e guarda em whatsapp_oficial.preco_marketing — assim ele
 * acompanha sozinho as mudanças da tabela da Meta. Até a primeira medição vale a tabela:
 * R$ 0,3217 por mensagem de marketing no Brasil (tabela em BRL; o mesmo cobrado na conta em 13/11/2026).
 */
export const PRECO_MARKETING_PADRAO = 0.3217

export const PRECOS_META = 'https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing'

export type PrecoMensagem = {
  valor: number
  moeda: string
  /** Dia das cobranças usadas na medição (null = tabela da Meta, ainda sem medição na conta). */
  medidoEm: string | null
}

export function precoDaConexao(c: { preco_marketing: number | null; preco_moeda: string | null; preco_marketing_dia: string | null }): PrecoMensagem {
  return c.preco_marketing !== null && c.preco_marketing > 0
    ? { valor: Number(c.preco_marketing), moeda: c.preco_moeda ?? 'BRL', medidoEm: c.preco_marketing_dia }
    : { valor: PRECO_MARKETING_PADRAO, moeda: 'BRL', medidoEm: null }
}

/** R$ 12,87 (dinheiro) ou R$ 0,3217 (preço unitário, com 4 casas). */
export function formatarCusto(valor: number, moeda = 'BRL', unitario = false): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: moeda,
    minimumFractionDigits: 2,
    maximumFractionDigits: unitario ? 4 : 2,
  }).format(valor)
}

type CampanhaComNumeros = {
  status: string | null
  total: number | null
  ignoradas: number | null
  entregues: number | null
  custo_meta: number | null
}

/**
 * Custo da campanha:
 *   tempoReal  → entregues × preço (os status chegam pelo webhook em segundos);
 *   meta       → o que a Meta informou pelo modelo (atrasa algumas horas; inclui testes e reenvios);
 *   gasto      → o maior dos dois (a Meta atrasa durante o envio, mas soma testes e reenvios);
 *   previsto   → todos os contatos da lista × preço (teto: quem não receber não é cobrado).
 */
export function custoDaCampanha(c: CampanhaComNumeros, preco: PrecoMensagem) {
  const contatos = Math.max((c.total ?? 0) - (c.ignoradas ?? 0), 0)
  const tempoReal = (c.entregues ?? 0) * preco.valor
  const meta = c.custo_meta === null ? null : Number(c.custo_meta)
  return {
    contatos,
    tempoReal,
    meta,
    gasto: Math.max(tempoReal, meta ?? 0),
    previsto: contatos * preco.valor,
    comecou: (c.entregues ?? 0) > 0 || (meta ?? 0) > 0,
  }
}
