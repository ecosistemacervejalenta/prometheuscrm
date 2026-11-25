import type { Tom } from '@/lib/rotulos'
import type { StatusInfluenciador } from '@/types'

/**
 * Textos, tons e formatos do programa de influenciadores — usados no CRM e no Portal.
 * (Sem `server-only`: os componentes de cliente também importam daqui.)
 */

export const STATUS_INFLUENCIADOR: Record<StatusInfluenciador, { rotulo: string; tom: Tom; ajuda: string }> = {
  ativo: { rotulo: 'Ativo', tom: 'sucesso', ajuda: 'Cupom valendo na loja.' },
  pausado: { rotulo: 'Pausado', tom: 'alerta', ajuda: 'Cupom desligado por enquanto. As vendas já feitas continuam valendo.' },
  encerrado: { rotulo: 'Encerrado', tom: 'neutro', ajuda: 'Parceria encerrada. O histórico e os repasses pendentes continuam aqui.' },
}

/** Situação de uma venda para quem olha a tela (vem pronta do banco: vw_influenciador_vendas.situacao). */
export type SituacaoVenda = 'aguardando_pagamento' | 'a_liberar' | 'disponivel' | 'paga' | 'cancelada'

export const SITUACAO_VENDA: Record<SituacaoVenda, { rotulo: string; tom: Tom; ajuda: string }> = {
  aguardando_pagamento: { rotulo: 'Aguardando pagamento', tom: 'alerta', ajuda: 'O cliente ainda não pagou o pedido.' },
  a_liberar: { rotulo: 'A liberar', tom: 'shopify', ajuda: 'Pedido pago. A comissão libera depois do prazo de trocas e devoluções.' },
  disponivel: { rotulo: 'Disponível', tom: 'volt', ajuda: 'Pronta para entrar no próximo repasse.' },
  paga: { rotulo: 'Paga', tom: 'sucesso', ajuda: 'Comissão já repassada.' },
  cancelada: { rotulo: 'Cancelada', tom: 'perigo', ajuda: 'Pedido cancelado ou estornado: não gera comissão.' },
}

export const SITUACOES_VENDA = Object.keys(SITUACAO_VENDA) as SituacaoVenda[]

export function situacaoDaVenda(valor: string | null | undefined): SituacaoVenda {
  return valor && valor in SITUACAO_VENDA ? (valor as SituacaoVenda) : 'aguardando_pagamento'
}

export const TIPOS_CHAVE_PIX = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Celular',
  aleatoria: 'Chave aleatória',
} as const

export type TipoChavePix = keyof typeof TIPOS_CHAVE_PIX

/** Situação do cupom na Shopify (influenciadores.cupom_situacao). */
export const CUPOM_SITUACAO: Record<string, { rotulo: string; tom: Tom }> = {
  ativo: { rotulo: 'Ativo na Shopify', tom: 'sucesso' },
  inativo: { rotulo: 'Desligado na Shopify', tom: 'neutro' },
  pendente: { rotulo: 'Falta criar na Shopify', tom: 'alerta' },
  erro: { rotulo: 'Erro na Shopify', tom: 'perigo' },
}

/** 12.5 → "12,5%" · 10 → "10%" */
export function formatarPercentual(valor: number | string | null | undefined): string {
  return `${Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

/** Link que já abre a loja com o cupom aplicado (recurso nativo da Shopify). */
export function linkDeDivulgacao(lojaUrl: string | null | undefined, cupom: string): string | null {
  return lojaUrl ? `${lojaUrl.replace(/\/+$/, '')}/discount/${encodeURIComponent(cupom)}` : null
}

/** "@lu.cervejeira" a partir do nome de usuário guardado sem arroba. */
export function arroba(instagram: string | null | undefined): string | null {
  return instagram ? `@${instagram}` : null
}

/** Resumo devolvido por resumo_influenciadores() e portal_resumo(). */
export type ResumoInfluenciadores = {
  periodo: { pedidos: number; vendido: number; comissao: number; desconto: number; cancelados: number; influenciadores: number }
  saldos: {
    aguardando: number
    a_liberar: number
    disponivel: number
    vendas_disponiveis: number
    proxima_liberacao: string | null
    recebido: number
  }
  total: { pedidos: number; vendido: number; comissao: number }
  serie: Array<{ dia: string; pedidos: number; vendido: number; comissao: number }>
}

export const RESUMO_VAZIO: ResumoInfluenciadores = {
  periodo: { pedidos: 0, vendido: 0, comissao: 0, desconto: 0, cancelados: 0, influenciadores: 0 },
  saldos: { aguardando: 0, a_liberar: 0, disponivel: 0, vendas_disponiveis: 0, proxima_liberacao: null, recebido: 0 },
  total: { pedidos: 0, vendido: 0, comissao: 0 },
  serie: [],
}

/** O jsonb do banco traz números como number; garante o formato mesmo com campos faltando. */
export function lerResumo(bruto: unknown): ResumoInfluenciadores {
  const r = (bruto ?? {}) as Partial<ResumoInfluenciadores>
  const n = (v: unknown) => Number(v ?? 0) || 0
  return {
    periodo: {
      pedidos: n(r.periodo?.pedidos),
      vendido: n(r.periodo?.vendido),
      comissao: n(r.periodo?.comissao),
      desconto: n(r.periodo?.desconto),
      cancelados: n(r.periodo?.cancelados),
      influenciadores: n(r.periodo?.influenciadores),
    },
    saldos: {
      aguardando: n(r.saldos?.aguardando),
      a_liberar: n(r.saldos?.a_liberar),
      disponivel: n(r.saldos?.disponivel),
      vendas_disponiveis: n(r.saldos?.vendas_disponiveis),
      proxima_liberacao: r.saldos?.proxima_liberacao ?? null,
      recebido: n(r.saldos?.recebido),
    },
    total: { pedidos: n(r.total?.pedidos), vendido: n(r.total?.vendido), comissao: n(r.total?.comissao) },
    serie: (r.serie ?? []).map((p) => ({ dia: String(p.dia), pedidos: n(p.pedidos), vendido: n(p.vendido), comissao: n(p.comissao) })),
  }
}
