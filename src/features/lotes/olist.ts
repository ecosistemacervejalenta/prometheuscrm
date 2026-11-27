import 'server-only'

import {
  acharProdutoPorSkuOlist,
  buscarProdutosPorGtinOlist,
  custoUnitarioOlist,
  ErroApiOlist,
  EscritaBloqueadaOlist,
  lancarBalancoEstoqueOlist,
  obterEstoqueOlist,
  obterProdutoLoteOlist,
  type ProdutoAchadoOlist,
  type ProdutoLoteOlist,
} from '@/features/olist/api'
import { obterTokenOlist } from '@/features/olist/token'
import { createAdminClient } from '@/lib/supabase/admin'

import { CERVEJAS_POR_RODADA, PAUSA_ENTRE_LEITURAS_MS, RELER_A_CADA_MIN } from './leitura'

/**
 * Lotes e validades × Olist. Tudo aqui é SÓ LEITURA (nome, SKU, foto e unidades em estoque),
 * com UMA exceção, no fim do arquivo: o balanço de estoque (enviarBalancoParaOlist), que troca o
 * saldo do produto na Olist pelo total contado no CRM — e nada mais.
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

// -----------------------------------------------------------------------------
// Balanço de estoque — a ÚNICA escrita deste módulo na Olist
// -----------------------------------------------------------------------------

export type ResultadoDoBalanco =
  /** A Olist ficou com o total contado e os lotes do CRM ficaram iguais à contagem. */
  | { situacao: 'concluido'; total: number; antes: number; conferido: number | null; idLancamento: number | null }
  /** recusado = nada mudou na Olist. conferir = sem confirmação (os lotes do CRM não mudaram). */
  | { situacao: 'recusado' | 'conferir'; mensagem: string }

/** O registro do balanço nasce segundos antes do envio: mais velho que isto não é enviado. */
const VALIDADE_DO_REGISTRO_MS = 2 * 60_000
/** Tamanho da observação do lançamento na Olist. */
const MAX_OBSERVACAO = 250

const unidades = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)

/** O que vai na observação do lançamento, na Olist: de onde veio, o número, quem contou e os lotes. */
function observacaoDoBalanco(balanco: { id: number; total: number; contagem: unknown; autor: string | null }, antes: number): string {
  const itens = Array.isArray(balanco.contagem) ? (balanco.contagem as Array<{ lote?: unknown; contado?: unknown }>) : []
  const lotes = itens.map((i) => `${String(i.lote ?? '—')} ${String(i.contado ?? '—')}`).join(', ')
  const texto =
    `BALANÇO PELO CRM #${balanco.id} · contado ${unidades(balanco.total)} un. (a Olist tinha ${unidades(antes)})` +
    `${balanco.autor ? ` · por ${balanco.autor}` : ''} · lotes: ${lotes}`
  return texto.length <= MAX_OBSERVACAO ? texto : `${texto.slice(0, MAX_OBSERVACAO - 1)}…`
}

/**
 * Envia à Olist o balanço registrado em lotes_balancos (a contagem que a equipe salvou): o saldo
 * do produto passa a ser o total contado, exato. Passos:
 *   1. pega o registro para envio (cada balanço é enviado UMA vez, e só logo depois de criado);
 *   2. lê o saldo e o custo médio na Olist — falhou aqui, nada foi enviado;
 *   3. lança o balanço (tipo B). Recusa da Olist (4xx) = nada mudou; sem resposta = incerto;
 *   4. confere: lê o saldo de novo;
 *   5. grava no banco, numa transação, os lotes iguais à contagem e o histórico.
 * Nada além do saldo muda na Olist (a trava de escrita em olist/api.ts garante).
 */
export async function enviarBalancoParaOlist(balancoId: number): Promise<ResultadoDoBalanco> {
  const supabase = createAdminClient()
  const { data: balanco, error } = await supabase
    .from('lotes_balancos')
    .update({ envio_iniciado_em: new Date().toISOString() })
    .eq('id', balancoId)
    .eq('status', 'enviando')
    .is('envio_iniciado_em', null)
    .gte('criado_em', new Date(Date.now() - VALIDADE_DO_REGISTRO_MS).toISOString())
    .select('id, olist_id, total, contagem, perfis(nome)')
    .maybeSingle()
  if (error) throw error
  if (!balanco) {
    return { situacao: 'recusado', mensagem: 'Este balanço já foi enviado ou expirou. Nada foi alterado agora: recarregue a página e confira o histórico da cerveja.' }
  }
  const { id, olist_id: olistId, total } = balanco

  type Extras = { p_estoque_antes?: number | null; p_estoque_depois?: number | null; p_id_lancamento?: number | null; p_observacao?: string | null }
  const falhar = async (situacao: 'recusado' | 'conferir', mensagem: string, extras: Extras = {}): Promise<ResultadoDoBalanco> => {
    const { error: erroAoRegistrar } = await supabase.rpc('falhar_balanco_dos_lotes', { p_id: id, p_status: situacao, p_erro: mensagem, ...extras })
    if (erroAoRegistrar) console.error('[lotes] balanço: a falha não foi registrada', id, erroAoRegistrar.message)
    return { situacao, mensagem }
  }

  // 2) Leituras. Nada foi enviado ainda: qualquer erro aqui deixa a Olist como estava.
  let token: string
  let antes: number
  let precoUnitario: number
  try {
    token = await obterTokenOlist(supabase)
    antes = (await obterEstoqueOlist(token, olistId, { esperarLimite: false })).saldo
    precoUnitario = await custoUnitarioOlist(token, olistId)
  } catch (erro) {
    return falhar('recusado', `Não foi possível ler a Olist antes do balanço (${mensagemDoErro(erro)}). Nada foi alterado: tente de novo em instantes.`)
  }
  const observacoes = observacaoDoBalanco({ id, total, contagem: balanco.contagem, autor: balanco.perfis?.nome ?? null }, antes)

  // 3) O lançamento. Não é repetido às cegas.
  let idLancamento: number | null = null
  let semResposta: string | null = null
  try {
    idLancamento = await lancarBalancoEstoqueOlist(token, olistId, { quantidade: total, precoUnitario, observacoes })
  } catch (erro) {
    const recusou = erro instanceof EscritaBloqueadaOlist || (erro instanceof ErroApiOlist && erro.status >= 400 && erro.status < 500)
    if (recusou) {
      return falhar('recusado', `A Olist não aceitou o balanço (${mensagemDoErro(erro)}). Nada foi alterado.`, { p_estoque_antes: antes, p_observacao: observacoes })
    }
    semResposta = mensagemDoErro(erro)
  }

  // 4) Conferência. Sem resposta do lançamento, só vale se o saldo de lá já for o número contado.
  const conferido = await obterEstoqueOlist(token, olistId, { esperarLimite: false })
    .then((e) => e.saldo)
    .catch(() => null)
  if (semResposta !== null && conferido !== total) {
    const situacaoLa = conferido === null ? 'Também não deu para ler o estoque de lá agora.' : `O estoque lá está em ${unidades(conferido)} un.`
    return falhar(
      'conferir',
      `A Olist não confirmou o balanço (${semResposta}). ${situacaoLa} Os lotes do CRM não foram alterados: confira o estoque na Olist e refaça o balanço.`,
      { p_estoque_antes: antes, p_estoque_depois: conferido, p_observacao: observacoes },
    )
  }

  // 5) Lotes do CRM iguais à contagem + histórico (uma transação no banco).
  const { error: erroAoConcluir } = await supabase.rpc('concluir_balanco_dos_lotes', {
    p_id: id,
    p_estoque_antes: antes,
    p_estoque_depois: conferido,
    p_id_lancamento: idLancamento,
    p_observacao: observacoes,
  })
  if (erroAoConcluir) {
    console.error('[lotes] balanço lançado na Olist, mas não gravado no CRM', id, erroAoConcluir.message)
    return falhar(
      'conferir',
      `A Olist foi atualizada para ${unidades(total)} un., mas os lotes do CRM não foram gravados (${erroAoConcluir.message}). Refaça o balanço desta cerveja com os mesmos números.`,
      { p_estoque_antes: antes, p_estoque_depois: conferido, p_id_lancamento: idLancamento, p_observacao: observacoes },
    )
  }
  return { situacao: 'concluido', total, antes, conferido, idLancamento }
}
