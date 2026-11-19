import 'server-only'

import { createHmac } from 'node:crypto'
import { after } from 'next/server'

import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database.types'

import {
  buscarProdutosOlist,
  ErroApiOlist,
  lancarEstoqueOlist,
  obterEstoqueOlist,
  obterProdutoOlist,
  obterResumoProdutoOlist,
  type ProdutoOlist,
  type ResultadoBuscaOlist,
} from './api'
import { ConexaoOlistExpirada } from './oauth'
import { obterTokenOlist, OlistNaoConectado } from './token'

/**
 * Estoque da Olist nas pré-vendas — tudo que usa a chave secreta e os tokens fica aqui
 * (chamado pela rotina /api/cron/olist-estoque, pelo webhook da Olist e pelo link público).
 *
 *   • Fila: o banco cria os lançamentos (venda → saída; cancelamento, exclusão e caixa vencida
 *     → entrada). Aqui eles são enviados à Olist, somados por produto (um lançamento por
 *     produto e rodada), com nova tentativa automática.
 *   • Leitura: o disponível de cada produto é lido na Olist logo depois dos lançamentos, quando
 *     a Olist avisa (webhook), a cada 5 min (rotina) e ao abrir o link, se estiver velho.
 */

type Admin = ReturnType<typeof createAdminClient>
type Movimento = Database['public']['Tables']['movimentos_estoque_olist']['Row']

const TRAVADO_MINUTOS = 10
const LEITURAS_SIMULTANEAS = 3
const MAX_LEITURAS_POR_RODADA = 80
export const IDADE_LEITURA_ROTINA_S = 4 * 60
export const IDADE_LEITURA_LINK_S = 2 * 60

const agora = () => new Date().toISOString()
const daquiA = (segundos: number) => new Date(Date.now() + segundos * 1000).toISOString()
const mensagemDe = (erro: unknown) => (erro instanceof Error ? erro.message : 'Erro desconhecido.').slice(0, 500)

/** Chave secreta da URL do webhook de estoque (derivada do CRON_SECRET; null se não houver). */
export function chaveWebhookEstoqueOlist(): string | null {
  if (!envServidor.cronSecret) return null
  return createHmac('sha256', envServidor.cronSecret).update('olist-webhook-estoque').digest('hex').slice(0, 32)
}

async function registrarErroEstoque(supabase: Admin, mensagem: string | null) {
  await supabase
    .from('integracao_olist')
    .update(mensagem ? { erro_estoque: mensagem, erro_estoque_em: agora() } : { erro_estoque: null, erro_estoque_em: null })
    .eq('id', 1)
}

async function avisar(supabase: Admin, titulo: string, texto: string) {
  const { error } = await supabase.rpc('avisar_estoque_olist', { p_titulo: titulo, p_texto: texto.slice(0, 300) })
  if (error) console.error('[olist-estoque] aviso no sino', error.message)
}

// -----------------------------------------------------------------------------
// Leitura do estoque
// -----------------------------------------------------------------------------

/** Lê o disponível na Olist e grava em estoque_olist. Para no limite de chamadas. */
async function lerEstoques(supabase: Admin, token: string, ids: number[]): Promise<{ lidos: number; falhas: number }> {
  const fila = [...new Set(ids)].slice(0, MAX_LEITURAS_POR_RODADA)
  let lidos = 0
  let falhas = 0
  let limite = false

  async function trabalhar() {
    for (let id = fila.shift(); id !== undefined; id = fila.shift()) {
      if (limite) break
      const lidoEm = agora()
      try {
        const e = await obterEstoqueOlist(token, id, { esperarLimite: false })
        const { error } = await supabase
          .from('estoque_olist')
          .update({
            saldo: e.saldo,
            reservado: e.reservado,
            disponivel: e.disponivel,
            lido_em: lidoEm,
            atualizando_desde: null,
            erro: null,
            ...(e.sku ? { sku: e.sku } : {}),
            ...(e.nome ? { nome: e.nome } : {}),
          })
          .eq('id', id)
        if (error) throw error
        lidos++
      } catch (erro) {
        falhas++
        if (erro instanceof ErroApiOlist && erro.status === 429) limite = true
        const motivo = erro instanceof ErroApiOlist && erro.status === 404 ? 'Produto não encontrado na Olist.' : mensagemDe(erro)
        await supabase.from('estoque_olist').update({ atualizando_desde: null, erro: motivo }).eq('id', id)
        if (erro instanceof ErroApiOlist && erro.status === 403) await registrarErroEstoque(supabase, erro.message)
      }
    }
  }

  await Promise.all(Array.from({ length: LEITURAS_SIMULTANEAS }, trabalhar))
  if (fila.length) await supabase.from('estoque_olist').update({ atualizando_desde: null }).in('id', fila)
  return { lidos, falhas }
}

/** Lê os produtos cuja leitura passou de `idadeSegundos` (e que ninguém está lendo agora). */
async function atualizarEstoques(supabase: Admin, token: string, ids: number[], idadeSegundos: number) {
  if (ids.length === 0) return { lidos: 0, falhas: 0 }
  const { data, error } = await supabase.rpc('reservar_leitura_estoque_olist', { p_ids: ids, p_idade_segundos: idadeSegundos })
  if (error) throw error
  return lerEstoques(supabase, token, data ?? [])
}

/** Ids da Olist (produto ou componentes do kit) dos produtos do CRM informados. */
async function idsOlistDosProdutos(supabase: Admin, produtoIds: string[]): Promise<number[]> {
  if (produtoIds.length === 0) return []
  const { data } = await supabase.from('produtos').select('olist_id, olist_kit').in('id', produtoIds).not('olist_id', 'is', null)
  return (data ?? []).flatMap((p) => {
    const kit = Array.isArray(p.olist_kit) ? (p.olist_kit as Array<{ id?: unknown }>) : []
    const componentes = kit.map((k) => Number(k.id)).filter((id) => Number.isSafeInteger(id) && id > 0)
    return componentes.length ? componentes : p.olist_id ? [p.olist_id] : []
  })
}

/** Link público: atualiza o estoque das cervejas da pré-venda se a leitura estiver velha. */
export async function atualizarEstoqueDaPreVenda(slug: string): Promise<void> {
  const supabase = createAdminClient()
  const { data: preVenda } = await supabase.from('pre_vendas').select('id').eq('slug', slug).maybeSingle()
  if (!preVenda) return
  const { data: itens } = await supabase.from('pre_venda_itens').select('produto_id').eq('pre_venda_id', preVenda.id)
  const ids = await idsOlistDosProdutos(supabase, (itens ?? []).map((i) => i.produto_id))
  if (ids.length === 0) return
  try {
    await atualizarEstoques(supabase, await obterTokenOlist(supabase), ids, IDADE_LEITURA_LINK_S)
  } catch (erro) {
    if (!(erro instanceof OlistNaoConectado)) console.error('[olist-estoque] leitura pelo link', mensagemDe(erro))
  }
}

// -----------------------------------------------------------------------------
// Fila de lançamentos
// -----------------------------------------------------------------------------

export type ResultadoFilaEstoque = {
  ok: boolean
  enviados: number
  lancamentos: number
  falhas: number
  travados: number
  motivo?: string
}

/** Texto do lançamento na Olist (aparece no histórico do estoque do produto). */
function observacaoDoLote(movimentos: Movimento[], tipo: 'S' | 'E', lote: string): string {
  const numeros = [...new Set(movimentos.map((m) => m.pedido_numero).filter((n): n is number => typeof n === 'number'))].sort((a, b) => a - b)
  const lista = numeros.slice(0, 8).map((n) => `#${n}`).join(', ')
  const resto = numeros.length > 8 ? ` e mais ${numeros.length - 8}` : ''
  const acao = tipo === 'S' ? 'venda na pré-venda' : 'devolução (cancelada/vencida)'
  return `Prometheus CRM · ${acao}${lista ? ` · Caixa VIP ${lista}${resto}` : ''} · ref ${lote.slice(0, 8)}`
}

async function devolverParaFila(supabase: Admin, ids: number[], segundos: number, erro?: string) {
  if (ids.length === 0) return
  await supabase
    .from('movimentos_estoque_olist')
    .update({ status: 'pendente', enviando_desde: null, proximo_envio_em: daquiA(segundos), ...(erro ? { ultimo_erro: erro } : {}) })
    .in('id', ids)
    .eq('status', 'enviando')
}

/** Envio interrompido no meio (função derrubada): não dá para saber se a Olist recebeu. */
async function marcarTravados(supabase: Admin): Promise<number> {
  const { data } = await supabase
    .from('movimentos_estoque_olist')
    .update({
      status: 'conferir',
      enviando_desde: null,
      ultimo_erro: 'O envio foi interrompido sem resposta da Olist. Confira no histórico do estoque se o lançamento entrou.',
    })
    .eq('status', 'enviando')
    .lt('enviando_desde', new Date(Date.now() - TRAVADO_MINUTOS * 60_000).toISOString())
    .select('id')
  return data?.length ?? 0
}

/**
 * Envia os lançamentos pendentes à Olist. Para no limite de chamadas (o resto fica para a
 * próxima rodada) e dentro do tempo informado.
 */
export async function processarFilaEstoqueOlist({ tempoMaximoMs = 45_000 } = {}): Promise<ResultadoFilaEstoque> {
  const supabase = createAdminClient()
  const inicio = Date.now()
  const resultado: ResultadoFilaEstoque = { ok: true, enviados: 0, lancamentos: 0, falhas: 0, travados: 0 }
  const erros: string[] = []

  resultado.travados = await marcarTravados(supabase)
  if (resultado.travados) erros.push(`${resultado.travados} lançamento(s) interrompido(s): confira na Olist`)

  const { count } = await supabase
    .from('movimentos_estoque_olist')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendente')
    .lte('proximo_envio_em', agora())
  if (!count) {
    if (erros.length) await avisar(supabase, 'Estoque da Olist: confira lançamentos', erros.join(' · '))
    return resultado
  }

  let token: string
  try {
    token = await obterTokenOlist(supabase)
  } catch (erro) {
    const motivo = erro instanceof OlistNaoConectado ? 'O Olist não está conectado.' : mensagemDe(erro)
    if (erro instanceof ConexaoOlistExpirada) await avisar(supabase, 'Olist desconectado', 'A conexão expirou: reconecte em Configurações › Olist ERP. As baixas de estoque estão esperando na fila.')
    return { ...resultado, ok: false, motivo }
  }

  const lidos = new Set<number>()
  let parar = false

  while (!parar && Date.now() - inicio < tempoMaximoMs) {
    const { data: reservados, error } = await supabase.rpc('reservar_movimentos_olist', { p_limite: 200 })
    if (error) throw error
    if (!reservados?.length) break

    const porProduto = new Map<number, Movimento[]>()
    for (const m of reservados) porProduto.set(m.olist_produto_id, [...(porProduto.get(m.olist_produto_id) ?? []), m])

    for (const [produtoId, movimentos] of porProduto) {
      const ids = movimentos.map((m) => m.id)
      if (parar || Date.now() - inicio >= tempoMaximoMs) {
        await devolverParaFila(supabase, ids, 0)
        continue
      }

      const saldo = movimentos.reduce((s, m) => s + (m.tipo === 'S' ? m.quantidade : -m.quantidade), 0)
      const lote = crypto.randomUUID()
      const tipo = saldo > 0 ? 'S' : 'E'
      try {
        // Saídas e entradas do mesmo produto se compensam: só a diferença vai para a Olist.
        const idLancamento = saldo === 0 ? null : await lancarEstoqueOlist(token, produtoId, { tipo, quantidade: Math.abs(saldo), observacoes: observacaoDoLote(movimentos, tipo, lote) })
        await supabase
          .from('movimentos_estoque_olist')
          .update({ status: 'enviado', enviado_em: agora(), enviando_desde: null, lote, id_lancamento: idLancamento, ultimo_erro: null })
          .in('id', ids)
          .eq('status', 'enviando')
        resultado.enviados += ids.length
        if (saldo !== 0) {
          resultado.lancamentos++
          lidos.add(produtoId)
        }
      } catch (erro) {
        const motivo = mensagemDe(erro)
        if (erro instanceof ErroApiOlist && erro.status === 429) {
          await devolverParaFila(supabase, ids, erro.liberaEm ?? 30)
          parar = true
        } else if (erro instanceof ErroApiOlist && erro.status === 401) {
          await devolverParaFila(supabase, ids, 60, motivo)
          parar = true
        } else if (erro instanceof ErroApiOlist && erro.status >= 500) {
          const tentativas = Math.max(...movimentos.map((m) => m.tentativas))
          await devolverParaFila(supabase, ids, Math.min(2 ** tentativas, 60) * 60, motivo)
        } else if (erro instanceof ErroApiOlist) {
          // A Olist recusou (produto sem controle de estoque, sem permissão...): precisa de alguém.
          await supabase
            .from('movimentos_estoque_olist')
            .update({ status: 'erro', enviando_desde: null, ultimo_erro: motivo })
            .in('id', ids)
            .eq('status', 'enviando')
          resultado.falhas += ids.length
          erros.push(motivo)
          if (erro.status === 403) parar = true
        } else {
          // Sem resposta (rede/tempo esgotado): a Olist pode ter recebido. Não repete sozinho.
          await supabase
            .from('movimentos_estoque_olist')
            .update({ status: 'conferir', enviando_desde: null, ultimo_erro: `Sem resposta da Olist (${motivo}). Confira no histórico do estoque se o lançamento entrou.` })
            .in('id', ids)
            .eq('status', 'enviando')
          resultado.falhas += ids.length
          erros.push('Sem resposta da Olist em um lançamento: confira')
        }
      }
    }
  }

  // Depois de lançar, lê o saldo novo (a cópia local fica igual à Olist).
  if (lidos.size) await atualizarEstoques(supabase, token, [...lidos], 0).catch((e) => console.error('[olist-estoque] leitura pós-lançamento', mensagemDe(e)))

  if (erros.length) {
    await registrarErroEstoque(supabase, erros[0])
    await avisar(supabase, 'Estoque da Olist: lançamento com problema', `${erros[0]}${erros.length > 1 ? ` (+${erros.length - 1})` : ''} · Veja em Configurações › Olist ERP.`)
  } else if (resultado.lancamentos) {
    await registrarErroEstoque(supabase, null)
  }
  return resultado
}

/**
 * Envia a fila depois da resposta — para rotas sem usuário logado (link público, API, webhooks).
 * A tela da equipe usa agendarEnvioEstoqueOlist (rotina-estoque.ts), que passa pela rotina.
 */
export function agendarFilaEstoqueOlist() {
  if (!process.env.SUPABASE_SECRET_KEY) return
  after(async () => {
    try {
      // Em drop, várias compras chegam juntas: esperar um instante junta as baixas do mesmo
      // produto num lançamento só (a Olist limita as chamadas por minuto).
      await new Promise((r) => setTimeout(r, 1500))
      await processarFilaEstoqueOlist()
    } catch (erro) {
      console.error('[olist-estoque] fila depois da resposta', mensagemDe(erro))
    }
  })
}

// -----------------------------------------------------------------------------
// Rotina (cron a cada 5 min) e aviso da Olist (webhook)
// -----------------------------------------------------------------------------

export type ResultadoRotinaEstoque = {
  ok: boolean
  caixasVencidas: number
  fila: ResultadoFilaEstoque
  leituras: { lidos: number; falhas: number }
  motivo?: string
}

/** Caixas vencidas → devolve; envia a fila; mantém atualizado o estoque das pré-vendas ativas. */
export async function rotinaEstoqueOlist(): Promise<ResultadoRotinaEstoque> {
  const supabase = createAdminClient()
  const { data: vencidas, error } = await supabase.rpc('vencer_caixas_vip')
  if (error) console.error('[olist-estoque] vencer caixas', error.message)

  const fila = await processarFilaEstoqueOlist({ tempoMaximoMs: 150_000 })
  let leituras = { lidos: 0, falhas: 0 }
  if (fila.ok) {
    const { data: emUso } = await supabase.rpc('produtos_olist_em_uso')
    if (emUso?.length) {
      try {
        leituras = await atualizarEstoques(supabase, await obterTokenOlist(supabase), emUso, IDADE_LEITURA_ROTINA_S)
      } catch (erro) {
        console.error('[olist-estoque] leitura da rotina', mensagemDe(erro))
      }
    }
  }
  return { ok: fila.ok, caixasVencidas: vencidas ?? 0, fila, leituras, motivo: fila.motivo }
}

/** Ids de produto e SKUs em qualquer formato de aviso da Olist (API v2/v3). */
function lerAviso(corpo: unknown): { ids: Set<number>; skus: Set<string> } {
  const ids = new Set<number>()
  const skus = new Set<string>()
  const visitar = (valor: unknown, chave: string, dentroDeProdutos: boolean, profundidade: number) => {
    if (profundidade > 6 || valor === null || valor === undefined) return
    if (Array.isArray(valor)) return valor.forEach((v) => visitar(v, chave, dentroDeProdutos || chave === 'produtos', profundidade + 1))
    if (typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) visitar(v, k, dentroDeProdutos, profundidade + 1)
      return
    }
    const id = Number(valor)
    if (['idProduto', 'id_produto', 'idproduto'].includes(chave) || (dentroDeProdutos && chave === 'id')) {
      if (Number.isSafeInteger(id) && id > 0) ids.add(id)
    }
    if (['sku', 'codigo', 'skuMapeamento'].includes(chave) && typeof valor === 'string' && valor.trim()) skus.add(valor.trim())
  }
  visitar(corpo, '', false, 0)
  return { ids, skus }
}

/** Aviso de estoque da Olist: lê de novo os produtos citados que o CRM usa. */
export async function receberAvisoEstoqueOlist(corpo: unknown): Promise<{ produtos: number }> {
  const supabase = createAdminClient()
  const { ids, skus } = lerAviso(corpo)
  let alvo: number[] = []
  if (ids.size || skus.size) {
    const [{ data: porId }, { data: porSku }] = await Promise.all([
      ids.size ? supabase.from('estoque_olist').select('id').in('id', [...ids]) : Promise.resolve({ data: [] as { id: number }[] }),
      skus.size ? supabase.from('estoque_olist').select('id').in('sku', [...skus]) : Promise.resolve({ data: [] as { id: number }[] }),
    ])
    alvo = [...new Set([...(porId ?? []), ...(porSku ?? [])].map((r) => r.id))]
  } else {
    // Formato desconhecido: confere os produtos das pré-vendas ativas (no máximo 1x por minuto cada).
    const { data } = await supabase.rpc('produtos_olist_em_uso')
    alvo = data ?? []
  }
  if (alvo.length === 0) return { produtos: 0 }
  const token = await obterTokenOlist(supabase)
  const { lidos } = await atualizarEstoques(supabase, token, alvo, ids.size || skus.size ? 0 : 60)
  return { produtos: lidos }
}

// -----------------------------------------------------------------------------
// Pedidos da tela (via rotina): buscar e preparar produtos para a pré-venda
// -----------------------------------------------------------------------------

export type ResultadoBuscaComEstoque = ResultadoBuscaOlist & { estoque: number | null; foto: string | null }

/** Foto e estoque já consultados (10 min): repetir a busca não gasta o limite da Olist de novo. */
const resumos = new Map<number, { foto: string | null; estoque: number | null; em: number }>()
const VALIDADE_RESUMO_MS = 10 * 60_000

export async function buscarNaOlist(termo: string): Promise<ResultadoBuscaComEstoque[]> {
  const supabase = createAdminClient()
  const token = await obterTokenOlist(supabase)
  try {
    const produtos = await buscarProdutosOlist(token, termo)
    // Foto e estoque de cada resultado (sem esperar o limite: o que não vier aparece sem foto e com "—").
    const agoraMs = Date.now()
    const comEstoque: ResultadoBuscaComEstoque[] = produtos.map((p) => {
      const guardado = resumos.get(p.id)
      return guardado && agoraMs - guardado.em < VALIDADE_RESUMO_MS
        ? { ...p, estoque: guardado.estoque, foto: guardado.foto }
        : { ...p, estoque: null, foto: null }
    })
    const fila = comEstoque.filter((p) => !resumos.has(p.id) || agoraMs - resumos.get(p.id)!.em >= VALIDADE_RESUMO_MS)
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let p = fila.shift(); p; p = fila.shift()) {
          try {
            const resumo = await obterResumoProdutoOlist(token, p.id)
            Object.assign(p, resumo)
            resumos.set(p.id, { ...resumo, em: Date.now() })
          } catch {
            break
          }
        }
      }),
    )
    if (resumos.size > 2000) resumos.clear()
    await registrarErroEstoque(supabase, null)
    return comEstoque
  } catch (erro) {
    if (erro instanceof ErroApiOlist && erro.status === 403) await registrarErroEstoque(supabase, erro.message)
    throw erro
  }
}

/** Produto completo + estoque lido agora (dele ou dos componentes do kit). */
export async function prepararProdutoOlist(id: number): Promise<ProdutoOlist> {
  const supabase = createAdminClient()
  const token = await obterTokenOlist(supabase)
  const produto = await obterProdutoOlist(token, id)
  const ids = produto.kit.length ? produto.kit.map((k) => k.id) : [produto.id]
  // Cria as linhas do estoque (com nome e SKU) e lê o saldo de cada uma agora.
  const { error } = await supabase.from('estoque_olist').upsert(
    (produto.kit.length ? produto.kit : [produto]).map((p) => ({ id: p.id, sku: p.sku, nome: p.nome })),
    { onConflict: 'id' },
  )
  if (error) throw error
  const { falhas } = await lerEstoques(supabase, token, ids)
  if (falhas) throw new Error('Não foi possível ler o estoque deste produto na Olist agora. Tente de novo em instantes.')
  return produto
}
