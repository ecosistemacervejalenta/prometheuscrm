import 'server-only'

import { buscarProdutoPorSkuOlist, ErroApiOlist, obterProdutoLoteOlist, type ProdutoLoteOlist } from '@/features/olist/api'
import { obterTokenOlist } from '@/features/olist/token'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Lotes e validades × Olist — SÓ LEITURA. Aqui o CRM consulta o produto (nome, SKU, foto e
 * unidades em estoque) e nunca envia nada à Olist.
 * Usa a chave secreta e os tokens da Olist, então só roda na rota /api/cron/olist-estoque
 * (a tela pede por pedirARotinaEstoque).
 */

/** Produto da Olist com este SKU (null se não existir). */
export async function consultarSkuNaOlist(sku: string): Promise<ProdutoLoteOlist | null> {
  const supabase = createAdminClient()
  return buscarProdutoPorSkuOlist(await obterTokenOlist(supabase), sku)
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

const CERVEJAS_POR_RODADA = 10
const IDADE_DA_LEITURA_MS = 60 * 60_000

/**
 * Rotina (a cada 5 min): relê o nome e o estoque das cervejas com a leitura mais antiga (mais
 * de 1 h), poucas por vez para não disputar o limite de chamadas da Olist com as pré-vendas.
 * Devolve quantas foram atualizadas.
 */
export async function atualizarEstoqueDasCervejasDosLotes(): Promise<number> {
  const supabase = createAdminClient()
  const limite = new Date(Date.now() - IDADE_DA_LEITURA_MS).toISOString()
  const { data: cervejas, error } = await supabase
    .from('lotes_cervejas')
    .select('id, olist_id')
    .or(`estoque_lido_em.is.null,estoque_lido_em.lt."${limite}"`)
    .order('estoque_lido_em', { ascending: true, nullsFirst: true })
    .limit(CERVEJAS_POR_RODADA)
  if (error) throw error
  if (!cervejas?.length) return 0

  const token = await obterTokenOlist(supabase)
  let atualizadas = 0
  for (const cerveja of cervejas) {
    const lidoEm = new Date().toISOString()
    try {
      const produto = await obterProdutoLoteOlist(token, cerveja.olist_id)
      await supabase
        .from('lotes_cervejas')
        .update({ nome: produto.nome.slice(0, 200), estoque_olist: produto.estoque, estoque_lido_em: lidoEm })
        .eq('id', cerveja.id)
      atualizadas++
    } catch (erro) {
      // Produto apagado na Olist: fica sem estoque informado (e sai da frente da fila).
      if (erro instanceof ErroApiOlist && erro.status === 404) {
        await supabase.from('lotes_cervejas').update({ estoque_olist: null, estoque_lido_em: lidoEm }).eq('id', cerveja.id)
        continue
      }
      // Limite de chamadas, acesso negado ou rede: o resto fica para a próxima rodada.
      break
    }
  }
  return atualizadas
}
