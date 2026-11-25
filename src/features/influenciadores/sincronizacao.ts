import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { ErroShopify } from '@/features/shopify/api'
import { acessoShopify } from '@/features/shopify/frete'
import type { Database, Json } from '@/types/database.types'

import { acessoComEscopo, ESCOPO_PEDIDOS, listarPedidosDaLoja, type PedidoDaShopify } from './shopify'

/**
 * Leitura dos pedidos da Shopify para o programa de influenciadores.
 * Roda SÓ com a chave secreta do Supabase (rotina /api/cron/influenciadores e ações da equipe já
 * conferidas). A cada rodada lê os pedidos ATUALIZADOS desde a última (novos, pagos, cancelados,
 * estornados) e entrega ao banco os que têm cupom de influenciador; quem decide a comissão é
 * registrar_venda_influenciador(). Rodar duas vezes não duplica nada.
 */

type Banco = SupabaseClient<Database>

/** read_orders enxerga os últimos 60 dias de pedidos. */
export const JANELA_DA_SHOPIFY_DIAS = 60
/** Relê um trecho já lido: cobre relógios diferentes e pedidos gravados no meio da rodada. */
const SOBREPOSICAO_MS = 5 * 60_000
const MAX_PAGINAS = 25
const TEMPO_MAXIMO_MS = 45_000

export type ResultadoDaSincronizacao =
  | { ok: true; lidos: number; comCupom: number; novas: number; atualizadas: number; incompleta: boolean }
  | { ok: false; motivo: 'sem_conexao' | 'sem_permissao' | 'erro'; mensagem: string }

type Contagem = { lidos: number; comCupom: number; novas: number; atualizadas: number }

async function cuponsDosInfluenciadores(db: Banco): Promise<Set<string>> {
  const { data, error } = await db.from('influenciadores').select('cupom')
  if (error) throw new Error(`influenciadores: ${error.message}`)
  return new Set((data ?? []).map((i) => i.cupom.toUpperCase()))
}

async function registrar(db: Banco, pedidos: PedidoDaShopify[], cupons: Set<string>, contagem: Contagem, origem: 'sincronizacao' | 'webhook') {
  for (const pedido of pedidos) {
    contagem.lidos++
    if (!pedido.cupons.some((c) => cupons.has(c.trim().toUpperCase()))) continue
    contagem.comCupom++
    const { data, error } = await db.rpc('registrar_venda_influenciador', { p_venda: { ...pedido, origem } as unknown as Json })
    if (error) throw new Error(`registrar venda ${pedido.pedido_numero ?? pedido.shopify_order_id}: ${error.message}`)
    const r = (data ?? {}) as { registrada?: boolean; nova?: boolean }
    if (r.registrada) contagem[r.nova ? 'novas' : 'atualizadas']++
  }
}

/** Token recusado no meio do caminho (trocado ou revogado na Shopify): pede outro e tenta uma vez. */
async function comTokenNovo<T>(db: Banco, tarefa: (acesso: NonNullable<Awaited<ReturnType<typeof acessoShopify>>>) => Promise<T>, acessoAtual: NonNullable<Awaited<ReturnType<typeof acessoShopify>>>): Promise<T> {
  try {
    return await tarefa(acessoAtual)
  } catch (e) {
    if (!(e instanceof ErroShopify) || e.tipo !== 'credenciais') throw e
    const novo = await acessoShopify(db, { renovar: true })
    if (!novo) throw e
    return tarefa(novo)
  }
}

const erroParaMensagem = (e: unknown) => (e instanceof ErroShopify ? e.message : 'Não foi possível ler os pedidos da Shopify. Tente de novo em instantes.')

/**
 * Lê os pedidos atualizados desde a última rodada e registra as vendas com cupom.
 * `conferirPermissao`: a equipe clicou em "Sincronizar agora" (confere na hora se o app já tem read_orders).
 */
export async function sincronizarVendas(db: Banco, { conferirPermissao = false } = {}): Promise<ResultadoDaSincronizacao> {
  const inicioDaRodada = new Date()
  const gravarEstado = (campos: Database['public']['Tables']['configuracoes']['Update']) => db.from('configuracoes').update(campos).eq('id', 1)

  try {
    const cupons = await cuponsDosInfluenciadores(db)
    // Sem influenciador cadastrado não há o que ler; o 1º cadastro dispara a leitura dos últimos 60 dias.
    if (cupons.size === 0) return { ok: true, lidos: 0, comCupom: 0, novas: 0, atualizadas: 0, incompleta: false }

    const permissao = await acessoComEscopo(db, ESCOPO_PEDIDOS, { conferir: conferirPermissao })
    if (!permissao.ok) {
      await gravarEstado({ influ_sincronizacao_erro: permissao.mensagem })
      return permissao
    }

    const { data: config } = await db.from('configuracoes').select('influ_sincronizado_ate').eq('id', 1).maybeSingle()
    const limiteDaShopify = inicioDaRodada.getTime() - JANELA_DA_SHOPIFY_DIAS * 86_400_000
    const desde = new Date(Math.max(config?.influ_sincronizado_ate ? new Date(config.influ_sincronizado_ate).getTime() - SOBREPOSICAO_MS : 0, limiteDaShopify))

    const contagem: Contagem = { lidos: 0, comCupom: 0, novas: 0, atualizadas: 0 }
    let cursor: string | null = null
    let ultimoLido = desde.toISOString()
    let incompleta = false

    for (let pagina = 0; ; pagina++) {
      if (pagina >= MAX_PAGINAS || Date.now() - inicioDaRodada.getTime() > TEMPO_MAXIMO_MS) {
        incompleta = true
        break
      }
      const { pedidos, proximo } = await comTokenNovo(
        db,
        (acesso) => listarPedidosDaLoja(acesso, `updated_at:>='${desde.toISOString()}'`, { cursor, ordem: 'UPDATED_AT' }),
        permissao.acesso,
      )
      await registrar(db, pedidos, cupons, contagem, 'sincronizacao')
      if (pedidos.length > 0) ultimoLido = pedidos.at(-1)!.atualizado_em
      if (!proximo) break
      cursor = proximo
    }

    // Rodada completa: a próxima começa de onde esta começou. Incompleta: continua do último pedido lido.
    await gravarEstado({
      influ_sincronizado_ate: incompleta ? ultimoLido : inicioDaRodada.toISOString(),
      influ_sincronizado_em: new Date().toISOString(),
      influ_sincronizacao_erro: null,
    })
    return { ok: true, ...contagem, incompleta }
  } catch (e) {
    console.error('[influenciadores] sincronizar vendas', e)
    const mensagem = erroParaMensagem(e)
    await gravarEstado({ influ_sincronizacao_erro: mensagem })
    if (e instanceof ErroShopify && e.tipo === 'permissao') return { ok: false, motivo: 'sem_permissao', mensagem }
    return { ok: false, motivo: 'erro', mensagem }
  }
}

/**
 * Procura os pedidos de UM cupom desde uma data (cupom que já existia antes do cadastro, ou
 * "contar vendas desde" alterado). Não mexe no cursor da sincronização geral.
 */
export async function buscarVendasDoCupom(db: Banco, cupom: string, desdeDia: string): Promise<ResultadoDaSincronizacao> {
  const inicio = Date.now()
  try {
    const permissao = await acessoComEscopo(db, ESCOPO_PEDIDOS, { conferir: true })
    if (!permissao.ok) return permissao

    const codigo = cupom.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const contagem: Contagem = { lidos: 0, comCupom: 0, novas: 0, atualizadas: 0 }
    let cursor: string | null = null
    let incompleta = false

    for (let pagina = 0; ; pagina++) {
      if (pagina >= MAX_PAGINAS || Date.now() - inicio > TEMPO_MAXIMO_MS) {
        incompleta = true
        break
      }
      const { pedidos, proximo } = await comTokenNovo(
        db,
        // Meia-noite de Brasília do dia escolhido.
        (acesso) => listarPedidosDaLoja(acesso, `discount_code:${codigo} created_at:>='${desdeDia}T00:00:00-03:00'`, { cursor, ordem: 'CREATED_AT' }),
        permissao.acesso,
      )
      await registrar(db, pedidos, new Set([codigo]), contagem, 'sincronizacao')
      if (!proximo) break
      cursor = proximo
    }
    return { ok: true, ...contagem, incompleta }
  } catch (e) {
    console.error('[influenciadores] buscar vendas do cupom', e)
    return { ok: false, motivo: e instanceof ErroShopify && e.tipo === 'permissao' ? 'sem_permissao' : 'erro', mensagem: erroParaMensagem(e) }
  }
}

/** Pedido que chegou pelo webhook da Shopify (se ele estiver ligado): registra na hora. Nunca lança. */
export async function registrarVendaDoWebhook(db: Banco, pedido: PedidoDaShopify | null): Promise<void> {
  if (!pedido) return
  const { error } = await db.rpc('registrar_venda_influenciador', { p_venda: { ...pedido, origem: 'webhook' } as unknown as Json })
  if (error) console.error('[influenciadores] venda do webhook', error.message)
}
