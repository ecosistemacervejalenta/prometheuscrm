import 'server-only'

import { statusShopify } from '@/features/shopify/queries'
import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'
import type { StatusInfluenciador } from '@/types'

import { lerResumo, type SituacaoVenda } from './rotulos'
import { ESCOPO_CUPONS, ESCOPO_PEDIDOS, temEscopo } from './shopify'

/** Consultas do programa de influenciadores para a equipe (RLS da sessão). */

export const VENDAS_POR_PAGINA = 40

export type RegrasDoPrograma = {
  /** Nome mostrado ao influenciador: o do programa ou, se vazio, o das Configurações. */
  nome_loja: string
  /** O que está salvo no campo do programa (vazio = usa o das Configurações). */
  nome_no_portal: string | null
  comissao_padrao: number
  desconto_padrao: number
  carencia_dias: number
  regras: string | null
  loja_url: string | null
  sincronizado_em: string | null
  sincronizacao_erro: string | null
}

export async function regrasDoPrograma(): Promise<RegrasDoPrograma> {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('configuracoes')
    .select('nome_loja, influ_nome_loja, influ_comissao_padrao, influ_desconto_padrao, influ_carencia_dias, influ_regras, influ_loja_url, influ_sincronizado_em, influ_sincronizacao_erro')
    .eq('id', 1)
    .maybeSingle()
  return {
    nome_loja: data?.influ_nome_loja?.trim() || data?.nome_loja || 'Loja',
    nome_no_portal: data?.influ_nome_loja ?? null,
    comissao_padrao: Number(data?.influ_comissao_padrao ?? 10),
    desconto_padrao: Number(data?.influ_desconto_padrao ?? 10),
    carencia_dias: Number(data?.influ_carencia_dias ?? 7),
    regras: data?.influ_regras ?? null,
    loja_url: data?.influ_loja_url ?? null,
    sincronizado_em: data?.influ_sincronizado_em ?? null,
    sincronizacao_erro: data?.influ_sincronizacao_erro ?? null,
  }
}

export type IntegracaoDoPrograma = {
  conectada: boolean
  loja: string | null
  loja_nome: string | null
  /** O app pode criar e pausar cupons (write_discounts). */
  cupons: boolean
  /** O app pode ler os pedidos (read_orders). */
  pedidos: boolean
}

/** O que o app da Shopify já consegue fazer pelo programa. */
export async function integracaoDoPrograma(): Promise<IntegracaoDoPrograma> {
  const status = await statusShopify()
  return {
    conectada: status.conectado,
    loja: status.loja,
    loja_nome: status.loja_nome,
    cupons: status.conectado && temEscopo(status.escopos, ESCOPO_CUPONS),
    pedidos: status.conectado && temEscopo(status.escopos, ESCOPO_PEDIDOS),
  }
}

export async function listarInfluenciadores({ busca, status }: { busca?: string; status?: StatusInfluenciador } = {}) {
  const { supabase } = await exigirEquipe()
  let consulta = supabase.from('vw_influenciadores').select('*').order('nome')
  if (status) consulta = consulta.eq('status', status)
  if (busca) {
    const termo = termoBusca(busca)
    if (termo) consulta = consulta.or(`nome.ilike.%${termo}%,cupom.ilike.%${termo}%,instagram.ilike.%${termo.replace(/^@/, '')}%,email.ilike.%${termo}%`)
  }
  const { data, error } = await consulta
  if (error) throw error
  return data
}

export async function obterInfluenciador(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('vw_influenciadores').select('*').eq('id', id).maybeSingle()
  return data
}

/** Totais, saldos e série por dia — do programa inteiro ou de um influenciador. */
export async function resumoDoPrograma(inicio: string, fim: string, influenciadorId?: string) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('resumo_influenciadores', { p_inicio: inicio, p_fim: fim, p_influenciador_id: influenciadorId })
  if (error) throw error
  return lerResumo(data)
}

export async function rankingDoPeriodo(inicio: string, fim: string, limite = 10) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('ranking_influenciadores', { p_inicio: inicio, p_fim: fim, p_limite: limite })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, pedidos: Number(r.pedidos), vendido: Number(r.vendido), comissao: Number(r.comissao) }))
}

export type FiltrosDeVendas = {
  influenciadorId?: string
  situacao?: SituacaoVenda
  inicio?: string
  fim?: string
  busca?: string
}

type ConsultaDeVendas<T> = {
  eq(coluna: string, valor: string): T
  gte(coluna: string, valor: string): T
  lte(coluna: string, valor: string): T
  ilike(coluna: string, padrao: string): T
}

/** Os mesmos filtros na lista, nos totais e na planilha. */
function filtrar<T extends ConsultaDeVendas<T>>(consulta: T, f: FiltrosDeVendas): T {
  let c = consulta
  if (f.influenciadorId) c = c.eq('influenciador_id', f.influenciadorId)
  if (f.situacao) c = c.eq('situacao', f.situacao)
  if (f.inicio) c = c.gte('dia', f.inicio)
  if (f.fim) c = c.lte('dia', f.fim)
  if (f.busca) {
    const termo = termoBusca(f.busca).replace(/^#/, '')
    if (termo) c = c.ilike('pedido_numero', `%${termo}%`)
  }
  return c
}

/** Vendas com cupom (paginadas) + os totais do filtro inteiro. */
export async function listarVendas(filtros: FiltrosDeVendas, pagina = 1) {
  const { supabase } = await exigirEquipe()
  const inicio = (pagina - 1) * VENDAS_POR_PAGINA

  const [lista, somas] = await Promise.all([
    filtrar(supabase.from('vw_influenciador_vendas').select('*', { count: 'exact' }), filtros)
      .order('pedido_em', { ascending: false })
      .range(inicio, inicio + VENDAS_POR_PAGINA - 1),
    filtrar(supabase.from('vw_influenciador_vendas').select('base, comissao, situacao'), filtros).limit(10_000),
  ])
  if (lista.error) throw lista.error
  if (somas.error) throw somas.error

  const validas = (somas.data ?? []).filter((v) => v.situacao !== 'cancelada')
  return {
    vendas: lista.data ?? [],
    total: lista.count ?? 0,
    somas: {
      pedidos: validas.length,
      vendido: validas.reduce((s, v) => s + Number(v.base ?? 0), 0),
      comissao: validas.reduce((s, v) => s + Number(v.comissao ?? 0), 0),
    },
  }
}

/** Todas as vendas do filtro, para a planilha (até 10 mil linhas). */
export async function vendasParaExportar(filtros: FiltrosDeVendas) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await filtrar(supabase.from('vw_influenciador_vendas').select('*'), filtros)
    .order('pedido_em', { ascending: false })
    .limit(10_000)
  if (error) throw error
  return data ?? []
}

export async function listarPagamentos({ influenciadorId, limite = 100 }: { influenciadorId?: string; limite?: number } = {}) {
  const { supabase } = await exigirEquipe()
  let consulta = supabase
    .from('influenciador_pagamentos')
    .select('*, influenciadores(id, nome, cupom), perfis(nome)')
    .order('pago_em', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(limite)
  if (influenciadorId) consulta = consulta.eq('influenciador_id', influenciadorId)
  const { data, error } = await consulta
  if (error) throw error
  return data ?? []
}

export type PagamentoComInfluenciador = Awaited<ReturnType<typeof listarPagamentos>>[number]

/** Quem tem comissão disponível para repasse agora (maior saldo primeiro). */
export async function influenciadoresAPagar() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('vw_influenciadores')
    .select('id, nome, cupom, instagram, whatsapp, tipo_chave_pix, chave_pix, nome_recebedor, saldo_disponivel, vendas_disponiveis, saldo_a_liberar, ultimo_pagamento_em')
    .gt('saldo_disponivel', 0)
    .order('saldo_disponivel', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Nome e cupom de todos, para o filtro da tela de vendas. */
export async function opcoesDeInfluenciadores() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('influenciadores').select('id, nome, cupom').order('nome')
  return data ?? []
}
