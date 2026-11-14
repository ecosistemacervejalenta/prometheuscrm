import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'

import { variaveisOlistFaltando } from './oauth'

export type StatusOlist = {
  /** OLIST_CLIENT_ID/SECRET definidos. */
  configurado: boolean
  /** Quais dessas variáveis o servidor ainda não enxerga. */
  variaveisFaltando: string[]
  /** CRON_SECRET definido (necessário para sincronizar). */
  sincronizacaoDisponivel: boolean
  conectado: boolean
  expirada: boolean
  conectadoEm: string | null
  ultimaSincronizacao: string | null
  ultimoErro: string | null
  /** Último erro ao ler ou lançar estoque (ex.: aplicativo sem permissão de Estoque). */
  erroEstoque: string | null
  erroEstoqueEm: string | null
}

/** Status da conexão com o Olist (sem tokens), lido com a sessão do usuário. */
export async function statusOlist(): Promise<StatusOlist> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('status_integracao_olist')
  if (error) throw error
  const s = (data ?? {}) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v : null)
  const variaveisFaltando = variaveisOlistFaltando()
  return {
    configurado: variaveisFaltando.length === 0,
    variaveisFaltando,
    sincronizacaoDisponivel: Boolean(envServidor.cronSecret),
    conectado: s.conectado === true,
    expirada: s.expirada === true,
    conectadoEm: texto(s.conectado_em),
    ultimaSincronizacao: texto(s.ultima_sincronizacao),
    ultimoErro: texto(s.ultimo_erro),
    erroEstoque: texto(s.erro_estoque),
    erroEstoqueEm: texto(s.erro_estoque_em),
  }
}

export type LancamentoComProblema = {
  id: number
  tipo: 'S' | 'E'
  quantidade: number
  status: 'erro' | 'conferir'
  pedidoId: string | null
  pedidoNumero: number | null
  produto: string
  erro: string | null
  criadoEm: string
}

export type ResumoEstoqueOlist = {
  produtosVinculados: number
  naFila: number
  ultimaLeitura: string | null
  problemas: LancamentoComProblema[]
}

/** Estoque das pré-vendas: cervejas vinculadas, fila de lançamentos e o que precisa de alguém. */
export async function resumoEstoqueOlist(): Promise<ResumoEstoqueOlist> {
  const { supabase } = await exigirEquipe()
  const [vinculados, fila, leitura, problemas] = await Promise.all([
    supabase.from('produtos').select('id', { count: 'exact', head: true }).not('olist_id', 'is', null),
    supabase.from('movimentos_estoque_olist').select('id', { count: 'exact', head: true }).in('status', ['pendente', 'enviando']),
    supabase.from('estoque_olist').select('lido_em').not('lido_em', 'is', null).order('lido_em', { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from('movimentos_estoque_olist')
      .select('id, tipo, quantidade, status, pedido_id, pedido_numero, olist_produto_id, ultimo_erro, criado_em')
      .in('status', ['erro', 'conferir'])
      .order('criado_em', { ascending: false })
      .limit(20),
  ])
  const ids = [...new Set((problemas.data ?? []).map((m) => m.olist_produto_id))]
  const { data: nomes } = ids.length ? await supabase.from('estoque_olist').select('id, nome, sku').in('id', ids) : { data: [] }
  const nomePorId = new Map((nomes ?? []).map((n) => [n.id, n.nome || n.sku || `Produto ${n.id}`]))

  return {
    produtosVinculados: vinculados.count ?? 0,
    naFila: fila.count ?? 0,
    ultimaLeitura: leitura.data?.lido_em ?? null,
    problemas: (problemas.data ?? []).map((m) => ({
      id: m.id,
      tipo: m.tipo === 'E' ? 'E' : 'S',
      quantidade: m.quantidade,
      status: m.status === 'conferir' ? 'conferir' : 'erro',
      pedidoId: m.pedido_id,
      pedidoNumero: m.pedido_numero,
      produto: nomePorId.get(m.olist_produto_id) ?? `Produto ${m.olist_produto_id} da Olist`,
      erro: m.ultimo_erro,
      criadoEm: m.criado_em,
    })),
  }
}
