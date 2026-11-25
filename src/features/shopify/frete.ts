import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'

import { calcularFrete, ErroShopify, pedirToken, type AcessoShopify } from './api'
import type { MotivoDaFalha, PedidoParaCotar, ResultadoDaCotacao } from './cotacao'

/**
 * Frete calculado sozinho para os pedidos do link com CEP fora da lista VIP.
 * Roda SÓ com a chave secreta do Supabase (link público, /pagar e ações da equipe já conferidas):
 * o Client secret e o token da Shopify saem do Vault só aqui.
 *
 * O banco decide SE precisa calcular (frete_a_calcular) e grava o resultado
 * (aplicar_frete_calculado); este arquivo só faz a ponte com a Shopify. Qualquer falha deixa o
 * pedido como "frete a cotar" — o caminho de antes, em que a equipe cota e avisa o cliente.
 */

type Banco = SupabaseClient<Database>

/** Pede um token novo quando falta menos que isto para o atual vencer (ele vale 24 h). */
const FOLGA_DO_TOKEN_MS = 10 * 60_000
/** Sem opção de entrega na 1ª resposta: tenta mais uma vez, se a 1ª foi rápida. */
const NOVA_TENTATIVA_ATE_MS = 5_000
const PAUSA_ANTES_DE_TENTAR_MS = 1_200

/** A loja está conectada para calcular frete? (Sem a migration aplicada, responde "não".) */
export async function shopifyConectada(db: Banco): Promise<boolean> {
  const { data } = await db.from('integracao_shopify').select('conectado_em').eq('id', 1).maybeSingle()
  return Boolean(data?.conectado_em)
}

/** Loja + token válido. Renova sozinho quando está perto de vencer. null = não conectada. */
async function acessoShopify(db: Banco, { renovar = false } = {}): Promise<AcessoShopify | null> {
  const { data, error } = await db.rpc('credenciais_shopify')
  if (error) {
    console.error('[shopify] credenciais', error.message)
    return null
  }
  const c = data?.[0]
  if (!c?.loja || !c.client_id || !c.client_secret) return null

  const valido = Boolean(c.access_token && c.token_expira_em && new Date(c.token_expira_em).getTime() - Date.now() > FOLGA_DO_TOKEN_MS)
  if (valido && !renovar) return { loja: c.loja, token: c.access_token as string }

  const novo = await pedirToken(c.loja, c.client_id, c.client_secret)
  const { error: erroAoGravar } = await db.rpc('gravar_token_shopify', { p_token: novo.token, p_expira_em: novo.expiraEm, p_escopos: novo.escopos })
  if (erroAoGravar) console.error('[shopify] gravar token', erroAoGravar.message)
  return { loja: c.loja, token: novo.token }
}

const MOTIVO_DO_ERRO: Record<ErroShopify['tipo'], MotivoDaFalha> = {
  credenciais: 'credenciais_recusadas',
  permissao: 'sem_permissao',
  recusou: 'shopify_recusou',
  fora_do_ar: 'shopify_fora_do_ar',
}

const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pergunta à loja o frete da caixa e devolve a opção mais barata do Olist Envios.
 * Nunca lança: conexão, permissão, loja fora do ar e "nenhuma opção" voltam como { ok: false }.
 */
export async function calcularFreteNaLoja(db: Banco, pedido: PedidoParaCotar): Promise<ResultadoDaCotacao> {
  try {
    let acesso = await acessoShopify(db)
    if (!acesso) return { ok: false, motivo: 'sem_conexao', detalhe: 'a Shopify não está conectada' }

    const inicio = Date.now()
    let resultado: ResultadoDaCotacao
    try {
      resultado = await calcularFrete(acesso, pedido)
    } catch (e) {
      // Token recusado (trocado ou revogado na Shopify): pede outro e tenta uma vez.
      if (!(e instanceof ErroShopify) || e.tipo !== 'credenciais') throw e
      acesso = await acessoShopify(db, { renovar: true })
      if (!acesso) return { ok: false, motivo: 'sem_conexao', detalhe: 'a Shopify não está conectada' }
      resultado = await calcularFrete(acesso, pedido)
    }

    if (!resultado.ok && resultado.motivo === 'sem_opcoes' && Date.now() - inicio < NOVA_TENTATIVA_ATE_MS) {
      await pausa(PAUSA_ANTES_DE_TENTAR_MS)
      resultado = await calcularFrete(acesso, pedido)
    }
    return resultado
  } catch (e) {
    if (e instanceof ErroShopify) {
      console.error('[shopify] calcular frete', e.tipo, e.message)
      // Conexão quebrada aparece em Configurações › Shopify; loja fora do ar é passageiro.
      if (e.tipo === 'credenciais' || e.tipo === 'permissao') {
        await db.from('integracao_shopify').update({ ultimo_erro: e.message }).eq('id', 1)
      }
      return { ok: false, motivo: MOTIVO_DO_ERRO[e.tipo], detalhe: e.message }
    }
    console.error('[shopify] calcular frete', e)
    return { ok: false, motivo: 'shopify_fora_do_ar', detalhe: 'não foi possível falar com a Shopify' }
  }
}

type Plano =
  | { calcular: false; motivo?: string }
  | { calcular: true; unidades: number; cep: string; valor: number; endereco: PedidoParaCotar['endereco'] }

type Aplicacao = { aplicado: boolean; motivo?: string; valor?: number; servico?: string }

export type FreteDoPedido =
  /** O frete do pedido está calculado para a caixa de agora. */
  | { situacao: 'calculado'; valor: number; servico: string }
  /** Nada a fazer: frete fixo, cotado à mão, já em dia, pedido pago/enviado ou Shopify desconectada. */
  | { situacao: 'nao_precisa'; motivo: string }
  /** Tentou e não deu: o pedido fica "a cotar". */
  | { situacao: 'nao_calculado'; motivo: string; detalhe: string }

/**
 * Garante o frete do pedido: se o CEP está fora da lista VIP e o frete ainda não foi calculado
 * para as cervejas e o CEP de agora, calcula na Shopify e grava. Pode ser chamada quantas vezes
 * for (tela final do link, /pagar, fechamento da caixa): só vai à Shopify quando precisa.
 * `forcar`: a equipe clicou em "Calcular" (ignora a espera depois de uma tentativa que falhou).
 */
export async function garantirFreteDoPedido(db: Banco, pedidoId: string, { forcar = false } = {}): Promise<FreteDoPedido> {
  try {
    if (!(await shopifyConectada(db))) return { situacao: 'nao_precisa', motivo: 'sem_conexao' }

    // Se uma compra entrar na caixa no meio da conta, o banco recusa o resultado: refaz uma vez.
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { data: plano, error } = await db.rpc('frete_a_calcular', { p_pedido_id: pedidoId, p_forcar: forcar })
      if (error) {
        console.error('[shopify] frete a calcular', error.message)
        return { situacao: 'nao_calculado', motivo: 'banco', detalhe: 'não foi possível ler o pedido' }
      }
      const p = (plano ?? { calcular: false }) as unknown as Plano
      if (!p.calcular) return { situacao: 'nao_precisa', motivo: p.motivo ?? 'sem_plano' }

      const resultado = await calcularFreteNaLoja(db, { unidades: p.unidades, cep: p.cep, valor: Number(p.valor) || 0, endereco: p.endereco ?? {} })
      // Desconectaram no meio do caminho: o pedido segue "a cotar", sem marcar falha.
      if (!resultado.ok && resultado.motivo === 'sem_conexao') return { situacao: 'nao_precisa', motivo: 'sem_conexao' }

      const { data: gravado, error: erroAoGravar } = await db.rpc('aplicar_frete_calculado', {
        p_pedido_id: pedidoId,
        p_unidades: p.unidades,
        p_cep: p.cep,
        p_resultado: resultado.ok
          ? { ok: true, valor: resultado.valor, servico: resultado.servico, peso_kg: resultado.pesoKg, opcoes: resultado.opcoes }
          : { ok: false, motivo: resultado.motivo, detalhe: resultado.detalhe },
      })
      if (erroAoGravar) {
        console.error('[shopify] gravar frete', erroAoGravar.message)
        return { situacao: 'nao_calculado', motivo: 'banco', detalhe: 'não foi possível gravar o frete' }
      }
      const a = (gravado ?? { aplicado: false }) as unknown as Aplicacao
      if (a.aplicado) return { situacao: 'calculado', valor: Number(a.valor) || 0, servico: a.servico ?? '' }
      if (a.motivo === 'caixa_mudou') continue
      if (a.motivo === 'cotacao_falhou' && !resultado.ok) return { situacao: 'nao_calculado', motivo: resultado.motivo, detalhe: resultado.detalhe }
      return { situacao: 'nao_precisa', motivo: a.motivo ?? 'sem_plano' }
    }
    return { situacao: 'nao_calculado', motivo: 'caixa_mudou', detalhe: 'a caixa mudou durante o cálculo' }
  } catch (e) {
    console.error('[shopify] garantir frete', e)
    return { situacao: 'nao_calculado', motivo: 'erro', detalhe: 'erro inesperado' }
  }
}
