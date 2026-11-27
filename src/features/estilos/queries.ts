import 'server-only'

import { temEscopo } from '@/features/influenciadores/shopify'
import { statusShopify } from '@/features/shopify/queries'
import { exigirEquipe } from '@/lib/auth'

import { desdeDoPeriodo, diasSemCompra, type FiltroPublico, type Periodo } from './schema'

/** Situação da leitura da loja (para os avisos da tela). */
export async function estadoDaLeitura() {
  const { supabase } = await exigirEquipe()
  const [conexao, { data: config }, { count: compras }, { count: clientes }] = await Promise.all([
    statusShopify(),
    supabase
      .from('configuracoes')
      .select('compras_sincronizado_em, compras_sincronizacao_erro, compras_historico_completo, colecoes_lidas_em')
      .eq('id', 1)
      .maybeSingle(),
    supabase.from('shopify_compras').select('id', { count: 'exact', head: true }).eq('valida', true),
    // Clientes (sem repetir) com ao menos uma compra na loja.
    supabase.from('clientes').select('id, shopify_compras!inner(id)', { count: 'exact', head: true }).eq('shopify_compras.valida', true),
  ])
  return {
    conectado: conexao.conectado,
    lojaNome: conexao.loja_nome,
    temHistorico: temEscopo(conexao.escopos, 'read_all_orders'),
    temClientes: temEscopo(conexao.escopos, 'read_customers'),
    lidoEm: config?.compras_sincronizado_em ?? null,
    erro: config?.compras_sincronizacao_erro ?? null,
    historicoCompleto: Boolean(config?.compras_historico_completo),
    colecoesLidas: Boolean(config?.colecoes_lidas_em),
    compras: compras ?? 0,
    compradores: clientes ?? 0,
  }
}

export type EstadoDaLeitura = Awaited<ReturnType<typeof estadoDaLeitura>>

/** Quantos clientes compraram cada collection no período. */
export async function rankingDeColecoes(periodo: Periodo) {
  const { supabase } = await exigirEquipe()
  const desde = desdeDoPeriodo(periodo)
  const { data, error } = await supabase.rpc('ranking_colecoes', desde ? { p_desde: desde } : {})
  if (error) throw error
  return data ?? []
}

export type LinhaDoRanking = Awaited<ReturnType<typeof rankingDeColecoes>>[number]

/** Público: quem comprou qualquer uma das collections escolhidas. */
export async function publicoPorColecoes(filtro: FiltroPublico) {
  if (filtro.colecoes.length === 0) return []
  const { supabase } = await exigirEquipe()
  const desde = desdeDoPeriodo(filtro.periodo)
  const semCompra = diasSemCompra(filtro.semCompra)
  const { data, error } = await supabase.rpc('publico_por_colecoes', {
    p_colecoes: filtro.colecoes,
    ...(desde ? { p_desde: desde } : {}),
    ...(semCompra ? { p_sem_compra_dias: semCompra } : {}),
  })
  if (error) throw error
  return data ?? []
}

export type ClienteDoPublico = Awaited<ReturnType<typeof publicoPorColecoes>>[number]

/** Todas as collections (para organizar o tipo). */
export async function colecoesDaLoja() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('shopify_colecoes')
    .select('id, titulo, tipo, tipo_manual, produtos, ativa')
    .order('titulo')
  if (error) throw error
  return data ?? []
}

/** Ficha do cliente: o que ele compra na loja (collections), os últimos pedidos e os totais da loja. */
export async function comprasNaLoja(clienteId: string) {
  const { supabase } = await exigirEquipe()
  const [gosto, compras] = await Promise.all([
    supabase.rpc('gosto_do_cliente', { p_cliente_id: clienteId }),
    supabase
      .from('shopify_compras')
      .select('id, numero, comprado_em, valor, valida, cancelado, status_financeiro, shopify_compra_itens (titulo, quantidade)')
      .eq('cliente_id', clienteId)
      .order('comprado_em', { ascending: false }),
  ])
  if (gosto.error) throw gosto.error
  if (compras.error) throw compras.error

  // Pedidos da loja que contam como compra (pagos): entram nos totais da ficha.
  const validas = (compras.data ?? []).filter((c) => c.valida)
  const totais = {
    pedidos: validas.length,
    valor: validas.reduce((s, c) => s + Number(c.valor), 0),
    unidades: validas.reduce((s, c) => s + c.shopify_compra_itens.reduce((t, i) => t + i.quantidade, 0), 0),
    ultima: validas[0]?.comprado_em ?? null,
  }
  return { gosto: gosto.data ?? [], compras: (compras.data ?? []).slice(0, 10), totais }
}
