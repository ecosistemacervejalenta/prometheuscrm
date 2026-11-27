import 'server-only'

import {
  acharProdutoPorSkuOlist,
  buscarProdutosPorGtinOlist,
  ErroApiOlist,
  obterProdutoLoteOlist,
  type ProdutoAchadoOlist,
  type ProdutoLoteOlist,
} from '@/features/olist/api'
import { obterTokenOlist } from '@/features/olist/token'
import { createAdminClient } from '@/lib/supabase/admin'

import { CERVEJAS_POR_RODADA, PAUSA_ENTRE_LEITURAS_MS, RELER_A_CADA_MIN } from './leitura'

/**
 * Lotes e validades × Olist — SÓ LEITURA. Aqui o CRM consulta o produto (nome, SKU, foto e
 * unidades em estoque) e nunca envia nada à Olist.
 * Usa a chave secreta e os tokens da Olist, então só roda na rota /api/cron/olist-estoque
 * (a tela pede por pedirARotinaEstoque).
 */

/** Produto da Olist com este SKU (null se não existir). Só a listagem: o detalhe vem depois. */
export async function consultarSkuNaOlist(sku: string): Promise<ProdutoAchadoOlist | null> {
  const supabase = createAdminClient()
  return acharProdutoPorSkuOlist(await obterTokenOlist(supabase), sku)
}

/** Produtos da Olist com este código de barras (EAN), ativos primeiro (lista vazia se nenhum). */
export async function consultarGtinNaOlist(gtin: string): Promise<ProdutoAchadoOlist[]> {
  const supabase = createAdminClient()
  return buscarProdutosPorGtinOlist(await obterTokenOlist(supabase), gtin)
}

/** Relê um produto já cadastrado (null se ele não existir mais na Olist). */
export async function consultarProdutoLoteNaOlist(id: number): Promise<ProdutoLoteOlist | null> {
  const supabase = createAdminClient()
  try {
    return await obterProdutoLoteOlist(await obterTokenOlist(supabase), id)
  } catch (erro) {
    if (erro instanceof ErroApiOlist && erro.status === 404) return null
    throw erro
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mensagemDoErro = (erro: unknown) => (erro instanceof Error ? erro.message : 'Erro desconhecido ao ler a Olist.').slice(0, 300)

/**
 * Rotina (a cada 5 min): relê o nome e o estoque das cervejas com a leitura mais antiga (mais
 * de 1 h), poucas por vez e com pausa entre uma e outra, para não disputar o limite de chamadas
 * da Olist com as pré-vendas. No limite (ou se a Olist recusar), para e continua na próxima
 * rodada. Devolve quantas foram atualizadas.
 */
export async function atualizarEstoqueDasCervejasDosLotes(): Promise<number> {
  const supabase = createAdminClient()
  const limite = new Date(Date.now() - RELER_A_CADA_MIN * 60_000).toISOString()
  const { data: cervejas, error } = await supabase
    .from('lotes_cervejas')
    .select('id, olist_id, releitura_pedida_em')
    .or(`releitura_pedida_em.not.is.null,estoque_lido_em.is.null,estoque_lido_em.lt."${limite}"`)
    // Primeiro as que a Olist avisou que mudaram; depois as de leitura mais antiga.
    .order('releitura_pedida_em', { ascending: true, nullsFirst: false })
    .order('estoque_lido_em', { ascending: true, nullsFirst: true })
    .limit(CERVEJAS_POR_RODADA)
  if (error) throw error
  if (!cervejas?.length) return 0

  const token = await obterTokenOlist(supabase)
  let atualizadas = 0
  for (const [i, cerveja] of cervejas.entries()) {
    if (i > 0) await esperar(PAUSA_ENTRE_LEITURAS_MS)
    const lidoEm = new Date().toISOString()
    // Vai para o histórico do produto: leitura pedida pela Olist (aviso) ou rotina normal.
    const origem = cerveja.releitura_pedida_em ? 'aviso_olist' : 'rotina'
    try {
      const produto = await obterProdutoLoteOlist(token, cerveja.olist_id)
      await supabase
        .from('lotes_cervejas')
        // Se o estoque mudou, o banco registra a leitura e baixa dos lotes na mesma hora.
        .update({
          nome: produto.nome.slice(0, 200),
          estoque_olist: produto.estoque,
          estoque_lido_em: lidoEm,
          estoque_origem: origem,
          releitura_pedida_em: null,
          leitura_erro: null,
          leitura_erro_em: null,
        })
        .eq('id', cerveja.id)
      atualizadas++
    } catch (erro) {
      // Limite de chamadas: não é problema do produto; o resto fica para a próxima rodada.
      if (erro instanceof ErroApiOlist && erro.status === 429) break
      const naoExiste = erro instanceof ErroApiOlist && erro.status === 404
      await supabase
        .from('lotes_cervejas')
        .update({
          // Produto apagado na Olist: fica sem estoque informado (e sai da frente da fila).
          ...(naoExiste ? { estoque_olist: null, estoque_lido_em: lidoEm, releitura_pedida_em: null } : {}),
          estoque_origem: origem,
          leitura_erro: naoExiste ? 'Produto não encontrado na Olist.' : mensagemDoErro(erro),
          leitura_erro_em: lidoEm,
        })
        .eq('id', cerveja.id)
      if (naoExiste) continue
      // Acesso negado ou rede: as outras também falhariam; tenta de novo na próxima rodada.
      break
    }
  }
  return atualizadas
}

/**
 * A Olist avisou que o estoque destes produtos mudou: as cervejas do controle com esses ids ou
 * SKUs são relidas na próxima rodada da rotina (até 5 min), antes das outras. Não chama a Olist
 * aqui: o aviso pode citar muitos produtos de uma vez, e a rotina respeita o limite.
 */
export async function pedirReleituraDosLotes(ids: number[], skus: string[]): Promise<number> {
  if (ids.length === 0 && skus.length === 0) return 0
  const supabase = createAdminClient()
  const agora = new Date().toISOString()
  const marcar = (coluna: 'olist_id' | 'sku', valores: Array<number | string>) =>
    supabase.from('lotes_cervejas').update({ releitura_pedida_em: agora }).in(coluna, valores).is('releitura_pedida_em', null).select('id')
  const [porId, porSku] = await Promise.all([ids.length ? marcar('olist_id', ids) : null, skus.length ? marcar('sku', skus) : null])
  return (porId?.data?.length ?? 0) + (porSku?.data?.length ?? 0)
}
