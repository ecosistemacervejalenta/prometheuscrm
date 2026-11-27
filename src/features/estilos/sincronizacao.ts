import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { ESCOPO_PEDIDOS, ESCOPO_PRODUTOS, temEscopo } from '@/features/influenciadores/shopify'
import { ErroShopify, type AcessoShopify } from '@/features/shopify/api'
import { acessoShopify } from '@/features/shopify/frete'
import type { Database, Json } from '@/types/database.types'

import { lerProdutos, listarColecoes, listarCompras, PRODUTOS_POR_CHAMADA } from './shopify'

/**
 * Clientes por estilo: leitura da loja da Shopify.
 * Roda SÓ com a chave secreta do Supabase (rotina /api/cron/clientes-por-estilo e o botão
 * "Atualizar agora", depois de conferir a equipe). Cada rodada:
 *   1. relê as collections (no máximo a cada 12 h);
 *   2. lê os pedidos ATUALIZADOS desde a última rodada (novos, pagos, cancelados, estornados) —
 *      na 1ª rodada com read_all_orders, a loja inteira desde o 1º pedido;
 *   3. lê as collections dos produtos comprados que ainda não foram lidos (ou há mais de 24 h).
 * Quem liga o pedido ao cliente é registrar_compras_shopify(). Rodar duas vezes não duplica nada.
 */

type Banco = SupabaseClient<Database>

export const ESCOPO_HISTORICO = 'read_all_orders'
export const ESCOPO_CLIENTES = 'read_customers'

/** Sem read_all_orders, a Shopify só mostra os pedidos dos últimos 60 dias. */
const JANELA_DA_SHOPIFY_DIAS = 60
const SOBREPOSICAO_MS = 5 * 60_000
const RELER_COLECOES_MS = 12 * 3_600_000
const RELER_PRODUTOS_HORAS = 24
const TEMPO_MAXIMO_MS = 75_000
/** Pede outro token, no máximo 1x por hora, para ver se o app ganhou as permissões novas. */
const RECONFERIR_APOS_MS = 60 * 60_000

export type ResultadoDaLeitura =
  | {
      ok: true
      pedidos: number
      novos: number
      clientesNovos: number
      produtos: number
      colecoes: number | null
      incompleta: boolean
      historicoCompleto: boolean
      comCliente: boolean
    }
  | { ok: false; motivo: 'sem_conexao' | 'sem_permissao' | 'erro'; mensagem: string }

type Acesso = { acesso: AcessoShopify; escopos: string }

async function lerEscopos(db: Banco) {
  return (await db.from('integracao_shopify').select('escopos, verificado_em').eq('id', 1).maybeSingle()).data
}

/** Loja + token + escopos. Sem read_all_orders/read_customers, pede outro token para conferir (`conferir` ou 1x/h). */
async function acessoParaCompras(db: Banco, conferir: boolean): Promise<Acesso | null> {
  let acesso = await acessoShopify(db)
  if (!acesso) return null
  let conexao = await lerEscopos(db)
  const faltaAlgo = !temEscopo(conexao?.escopos, ESCOPO_HISTORICO) || !temEscopo(conexao?.escopos, ESCOPO_CLIENTES)
  const verificadoHa = conexao?.verificado_em ? Date.now() - new Date(conexao.verificado_em).getTime() : Infinity
  if (faltaAlgo && (conferir || verificadoHa > RECONFERIR_APOS_MS)) {
    acesso = await acessoShopify(db, { renovar: true })
    if (!acesso) return null
    conexao = await lerEscopos(db)
  }
  return { acesso, escopos: conexao?.escopos ?? '' }
}

/** Token recusado no meio do caminho (trocado ou revogado na Shopify): pede outro e tenta uma vez. */
async function comTokenNovo<T>(db: Banco, conexao: Acesso, tarefa: (acesso: AcessoShopify) => Promise<T>): Promise<T> {
  try {
    return await tarefa(conexao.acesso)
  } catch (e) {
    if (!(e instanceof ErroShopify) || e.tipo !== 'credenciais') throw e
    const novo = await acessoShopify(db, { renovar: true })
    if (!novo) throw e
    conexao.acesso = novo
    return tarefa(novo)
  }
}

async function rpc<T>(db: Banco, nome: 'registrar_colecoes_shopify' | 'registrar_produtos_shopify' | 'registrar_compras_shopify', args: Record<string, Json>): Promise<T> {
  const { data, error } = await db.rpc(nome, args as never)
  if (error) throw new Error(`${nome}: ${error.message}`)
  return data as T
}

const mensagemDoErro = (e: unknown) => (e instanceof ErroShopify ? e.message : 'Não foi possível ler a loja da Shopify. Tente de novo em instantes.')

/**
 * Lê a loja e atualiza compras, clientes e collections.
 * `conferirPermissao`: a equipe clicou em "Atualizar agora" (confere na hora as permissões novas).
 * `colecoesAgora`: relê as collections mesmo que a última leitura seja recente.
 */
export async function lerComprasDaLoja(db: Banco, { conferirPermissao = false, colecoesAgora = false } = {}): Promise<ResultadoDaLeitura> {
  const inicio = Date.now()
  const gravarEstado = (campos: Database['public']['Tables']['configuracoes']['Update']) => db.from('configuracoes').update(campos).eq('id', 1)
  const semTempo = () => Date.now() - inicio > TEMPO_MAXIMO_MS

  try {
    const conexao = await acessoParaCompras(db, conferirPermissao)
    if (!conexao) {
      const mensagem = 'A Shopify não está conectada. Conecte em Configurações › Shopify.'
      await gravarEstado({ compras_sincronizacao_erro: mensagem })
      return { ok: false, motivo: 'sem_conexao', mensagem }
    }
    const falta = [ESCOPO_PEDIDOS, ESCOPO_PRODUTOS].filter((e) => !temEscopo(conexao.escopos, e))
    if (falta.length > 0) {
      const mensagem = `O app da Shopify ainda não tem a permissão ${falta.join(' e ')} (leitura de ${falta.length > 1 ? 'pedidos e produtos' : falta[0] === ESCOPO_PEDIDOS ? 'pedidos' : 'produtos'}).`
      await gravarEstado({ compras_sincronizacao_erro: mensagem })
      return { ok: false, motivo: 'sem_permissao', mensagem }
    }
    const historico = temEscopo(conexao.escopos, ESCOPO_HISTORICO)
    const comCliente = temEscopo(conexao.escopos, ESCOPO_CLIENTES)

    const { data: config } = await db
      .from('configuracoes')
      .select('compras_sincronizado_ate, compras_historico_completo, colecoes_lidas_em')
      .eq('id', 1)
      .maybeSingle()

    // 1. Collections ------------------------------------------------------------------------
    let colecoes: number | null = null
    const colecoesLidasHa = config?.colecoes_lidas_em ? Date.now() - new Date(config.colecoes_lidas_em).getTime() : Infinity
    if (colecoesAgora || colecoesLidasHa > RELER_COLECOES_MS) {
      const lidas = await comTokenNovo(db, conexao, (acesso) => listarColecoes(acesso))
      colecoes = await rpc<number>(db, 'registrar_colecoes_shopify', { p_colecoes: lidas as unknown as Json })
    }

    // 2. Pedidos ----------------------------------------------------------------------------
    // Com read_all_orders e a loja ainda não lida inteira: começa do 1º pedido. Senão continua do
    // cursor (sem read_all_orders, nunca antes dos últimos 60 dias, que é o que a Shopify mostra).
    const lerTudo = historico && !config?.compras_historico_completo
    const cursorSalvo = config?.compras_sincronizado_ate ? new Date(config.compras_sincronizado_ate).getTime() - SOBREPOSICAO_MS : null
    const limite60 = Date.now() - JANELA_DA_SHOPIFY_DIAS * 86_400_000
    const desde = lerTudo ? null : historico ? cursorSalvo : Math.max(cursorSalvo ?? 0, limite60)
    const consulta = desde === null ? null : `updated_at:>='${new Date(desde).toISOString()}'`

    let pedidos = 0
    let novos = 0
    let clientesNovos = 0
    let incompleta = false
    let ultimoLido: string | null = null
    let pagina: string | null = null
    do {
      if (semTempo()) {
        incompleta = true
        break
      }
      const cursor: string | null = pagina
      const lida: Awaited<ReturnType<typeof listarCompras>> = await comTokenNovo(db, conexao, (acesso) =>
        listarCompras(acesso, consulta, { cursor, comCliente }),
      )
      const { compras, proximo } = lida
      if (compras.length > 0) {
        const r = await rpc<{ novas: number; clientes_novos: number }>(db, 'registrar_compras_shopify', { p_compras: compras as unknown as Json })
        pedidos += compras.length
        novos += r.novas
        clientesNovos += r.clientes_novos
        ultimoLido = compras.at(-1)!.atualizado_em
      }
      pagina = proximo
    } while (pagina)

    // Completa: a próxima rodada começa de onde esta começou. Incompleta: do último pedido lido
    // (a ordem é por atualização, então tudo antes dele já foi lido).
    await gravarEstado({
      compras_sincronizado_ate: incompleta ? (ultimoLido ?? config?.compras_sincronizado_ate ?? null) : new Date(inicio).toISOString(),
      compras_historico_completo: Boolean(config?.compras_historico_completo) || (historico && (!incompleta || ultimoLido !== null)),
      compras_sincronizado_em: new Date().toISOString(),
      compras_sincronizacao_erro: null,
    })

    // 3. Collections dos produtos comprados ---------------------------------------------------
    let produtos = 0
    const { data: paraLer, error } = await db.rpc('produtos_shopify_para_ler', { p_horas: RELER_PRODUTOS_HORAS, p_limite: 500 })
    if (error) throw new Error(`produtos_shopify_para_ler: ${error.message}`)
    const ids = (paraLer ?? []) as string[]
    for (let i = 0; i < ids.length; i += PRODUTOS_POR_CHAMADA) {
      if (semTempo()) {
        incompleta = true
        break
      }
      const lote = ids.slice(i, i + PRODUTOS_POR_CHAMADA)
      const lidos = await comTokenNovo(db, conexao, (acesso) => lerProdutos(acesso, lote))
      produtos += await rpc<number>(db, 'registrar_produtos_shopify', { p_produtos: lidos as unknown as Json })
    }

    return { ok: true, pedidos, novos, clientesNovos, produtos, colecoes, incompleta, historicoCompleto: historico, comCliente }
  } catch (e) {
    console.error('[clientes por estilo] ler a loja', e)
    const mensagem = mensagemDoErro(e)
    await gravarEstado({ compras_sincronizacao_erro: mensagem })
    if (e instanceof ErroShopify && e.tipo === 'permissao') return { ok: false, motivo: 'sem_permissao', mensagem }
    return { ok: false, motivo: 'erro', mensagem }
  }
}
