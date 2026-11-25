import 'server-only'

import { lerResumo, situacaoDaVenda, type SituacaoVenda } from '../rotulos'
import { exigirInfluenciador } from './sessao'

/** Consultas do Portal: sempre os dados do influenciador logado (funções portal_*() do banco). */

export const VENDAS_DO_PORTAL_POR_PAGINA = 30

export async function resumoDoPortal(inicio: string, fim: string) {
  const { supabase } = await exigirInfluenciador()
  const { data, error } = await supabase.rpc('portal_resumo', { p_inicio: inicio, p_fim: fim })
  if (error) throw error
  return lerResumo(data)
}

export type VendaDoPortal = {
  id: string
  pedido_numero: string | null
  pedido_em: string
  cupom: string
  base: number
  percentual: number
  comissao: number
  liberar_em: string
  situacao: SituacaoVenda
}

export async function vendasDoPortal({
  inicio,
  fim,
  situacao,
  pagina = 1,
  porPagina = VENDAS_DO_PORTAL_POR_PAGINA,
}: {
  inicio?: string
  fim?: string
  situacao?: SituacaoVenda
  pagina?: number
  porPagina?: number
} = {}) {
  const { supabase } = await exigirInfluenciador()
  const { data, error } = await supabase.rpc('portal_vendas', {
    p_inicio: inicio,
    p_fim: fim,
    p_situacao: situacao,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  })
  if (error) throw error

  const r = (data ?? {}) as { total?: number; soma_base?: number; soma_comissao?: number; vendas?: Array<Record<string, unknown>> }
  return {
    total: Number(r.total ?? 0),
    somaBase: Number(r.soma_base ?? 0),
    somaComissao: Number(r.soma_comissao ?? 0),
    vendas: (r.vendas ?? []).map(
      (v): VendaDoPortal => ({
        id: String(v.id),
        pedido_numero: (v.pedido_numero as string | null) ?? null,
        pedido_em: String(v.pedido_em),
        cupom: String(v.cupom),
        base: Number(v.base ?? 0),
        percentual: Number(v.percentual ?? 0),
        comissao: Number(v.comissao ?? 0),
        liberar_em: String(v.liberar_em),
        situacao: situacaoDaVenda(v.situacao as string),
      }),
    ),
  }
}

export type PagamentoDoPortal = {
  id: string
  pago_em: string
  total: number
  comissoes: number
  ajuste: number
  ajuste_motivo: string | null
  vendas: number
  chave_pix: string | null
  observacoes: string | null
}

export async function pagamentosDoPortal(): Promise<PagamentoDoPortal[]> {
  const { supabase } = await exigirInfluenciador()
  const { data, error } = await supabase.rpc('portal_pagamentos')
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    pago_em: String(p.pago_em),
    total: Number(p.total ?? 0),
    comissoes: Number(p.comissoes ?? 0),
    ajuste: Number(p.ajuste ?? 0),
    ajuste_motivo: (p.ajuste_motivo as string | null) ?? null,
    vendas: Number(p.vendas ?? 0),
    chave_pix: (p.chave_pix as string | null) ?? null,
    observacoes: (p.observacoes as string | null) ?? null,
  }))
}
