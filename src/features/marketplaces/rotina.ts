import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database.types'

import { MARKETPLACES, type IdMarketplace } from './canais'
import * as mercadoLivre from './mercado-livre'
import * as shopee from './shopee'

/**
 * Lado do servidor das conexões com Mercado Livre e Shopee. Roda só na rotina
 * /api/cron/marketplaces (service role): é a única que lê a chave secreta do app
 * no Vault e os tokens. A tela e o retorno da autorização pedem por disparo.ts.
 */

type Admin = ReturnType<typeof createAdminClient>
type Campos = Database['public']['Tables']['integracao_marketplace']['Update']

export type PedidoRotinaMarketplace =
  /** Retorno da autorização: troca o código pelos tokens e confere a conta. */
  | {
      acao: 'conectar'
      canal: IdMarketplace
      codigo: string
      redirectUri: string
      /** Mercado Livre: verificador PKCE guardado no cookie. */
      verificador?: string
      /** Shopee: shop_id devolvido junto com o código. */
      contaId?: string
      perfilId: string
    }
  /** Renova o acesso se preciso e confere a conta (botão "Testar conexão"). */
  | { acao: 'verificar'; canal: IdMarketplace }

export type RespostaRotinaMarketplace = { ok: boolean; mensagem: string }

/** Renova o access token quando faltar menos que isso para vencer. */
const MARGEM_RENOVACAO_MS = 30 * 60_000

const ehExpirada = (erro: unknown) => erro instanceof mercadoLivre.AutorizacaoExpirada || erro instanceof shopee.AutorizacaoExpirada
const mensagemDe = (erro: unknown) => (erro instanceof Error ? erro.message : 'Erro inesperado.')

async function credenciais(supabase: Admin, canal: IdMarketplace) {
  const { data, error } = await supabase.rpc('credenciais_marketplace', { p_canal: canal })
  if (error) throw error
  return data?.[0] ?? null
}

async function registrar(supabase: Admin, canal: IdMarketplace, campos: Campos) {
  const { error } = await supabase.from('integracao_marketplace').update(campos).eq('canal', canal)
  if (error) throw error
}

/** Autorização perdida: apaga os tokens e deixa o motivo para a tela mostrar "Reconectar". */
async function marcarExpirada(supabase: Admin, canal: IdMarketplace, motivo: string) {
  await registrar(supabase, canal, {
    access_token: null,
    refresh_token: null,
    access_expira_em: null,
    refresh_expira_em: null,
    ultimo_erro: `${motivo} Clique em Reconectar.`,
  })
}

export async function concluirConexao(
  supabase: Admin,
  pedido: Extract<PedidoRotinaMarketplace, { acao: 'conectar' }>,
): Promise<RespostaRotinaMarketplace> {
  const { canal } = pedido
  const nome = MARKETPLACES[canal].nome
  const cred = await credenciais(supabase, canal)
  if (!cred?.client_id || !cred.segredo) return { ok: false, mensagem: `Salve o ID e a chave do app do ${nome} antes de conectar.` }

  try {
    const agora = new Date().toISOString()
    if (canal === 'mercado_livre') {
      if (!pedido.verificador) return { ok: false, mensagem: 'A sessão da autorização expirou. Clique em Conectar de novo.' }
      const tokens = await mercadoLivre.trocarCodigo(cred.client_id, cred.segredo, pedido.codigo, pedido.redirectUri, pedido.verificador)
      const conta = await mercadoLivre.buscarConta(tokens.accessToken)
      await registrar(supabase, canal, {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        access_expira_em: tokens.accessExpiraEm,
        refresh_expira_em: null,
        autorizacao_expira_em: null,
        conta_id: conta.id || tokens.contaId,
        conta_nome: conta.nome || null,
        conectado_em: agora,
        conectado_por: pedido.perfilId,
        verificado_em: agora,
        ultimo_erro: null,
      })
      return { ok: true, mensagem: `Mercado Livre conectado à conta ${conta.nome || conta.id}.` }
    }

    if (!pedido.contaId) return { ok: false, mensagem: 'A Shopee não devolveu o código da loja. Autorize de novo.' }
    const tokens = await shopee.trocarCodigo(cred.client_id, cred.segredo, pedido.codigo, pedido.contaId)
    const loja = await shopee.buscarLoja(cred.client_id, cred.segredo, tokens.accessToken, pedido.contaId)
    await registrar(supabase, canal, {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      access_expira_em: tokens.accessExpiraEm,
      refresh_expira_em: tokens.refreshExpiraEm,
      autorizacao_expira_em: loja.autorizacaoExpiraEm,
      conta_id: pedido.contaId,
      conta_nome: loja.nome || null,
      conectado_em: agora,
      conectado_por: pedido.perfilId,
      verificado_em: agora,
      ultimo_erro: null,
    })
    return { ok: true, mensagem: `Shopee conectada à loja ${loja.nome || pedido.contaId}.` }
  } catch (erro) {
    console.error(`[marketplaces] falha ao conectar ${canal}`, erro)
    await registrar(supabase, canal, { ultimo_erro: mensagemDe(erro) }).catch(() => undefined)
    return { ok: false, mensagem: mensagemDe(erro) }
  }
}

/** Access token válido: renova (e grava o novo refresh token, que é de uso único) quando perto de vencer. */
async function acessoValido(supabase: Admin, canal: IdMarketplace, cred: NonNullable<Awaited<ReturnType<typeof credenciais>>>) {
  const vence = cred.access_expira_em ? new Date(cred.access_expira_em).getTime() : 0
  if (cred.access_token && vence - Date.now() > MARGEM_RENOVACAO_MS) return cred.access_token

  const tokens =
    canal === 'mercado_livre'
      ? await mercadoLivre.renovarTokens(cred.client_id, cred.segredo, cred.refresh_token)
      : await shopee.renovarTokens(cred.client_id, cred.segredo, cred.refresh_token, cred.conta_id)
  await registrar(supabase, canal, {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    access_expira_em: tokens.accessExpiraEm,
    refresh_expira_em: 'refreshExpiraEm' in tokens ? tokens.refreshExpiraEm : null,
  })
  return tokens.accessToken
}

export async function verificarConexao(supabase: Admin, canal: IdMarketplace): Promise<RespostaRotinaMarketplace> {
  const nome = MARKETPLACES[canal].nome
  const cred = await credenciais(supabase, canal)
  if (!cred?.client_id || !cred.segredo) return { ok: false, mensagem: `Salve o ID e a chave do app do ${nome}.` }
  if (!cred.refresh_token) return { ok: false, mensagem: `O ${nome} ainda não foi conectado. Clique em Conectar.` }

  try {
    const acesso = await acessoValido(supabase, canal, cred)
    const agora = new Date().toISOString()
    if (canal === 'mercado_livre') {
      const conta = await mercadoLivre.buscarConta(acesso)
      await registrar(supabase, canal, { conta_nome: conta.nome || null, verificado_em: agora, ultimo_erro: null })
      return { ok: true, mensagem: `Conexão com o Mercado Livre funcionando (conta ${conta.nome || conta.id}).` }
    }
    const loja = await shopee.buscarLoja(cred.client_id, cred.segredo, acesso, cred.conta_id)
    await registrar(supabase, canal, {
      conta_nome: loja.nome || null,
      autorizacao_expira_em: loja.autorizacaoExpiraEm,
      verificado_em: agora,
      ultimo_erro: null,
    })
    return { ok: true, mensagem: `Conexão com a Shopee funcionando (loja ${loja.nome || cred.conta_id}).` }
  } catch (erro) {
    console.error(`[marketplaces] falha ao verificar ${canal}`, erro)
    if (ehExpirada(erro)) await marcarExpirada(supabase, canal, mensagemDe(erro)).catch(() => undefined)
    else await registrar(supabase, canal, { ultimo_erro: mensagemDe(erro) }).catch(() => undefined)
    return { ok: false, mensagem: mensagemDe(erro) }
  }
}

/**
 * Rodada diária: renova o acesso de cada canal conectado e confere a conta. Mantém viva
 * a autorização (refresh da Shopee vence em 30 dias; o Mercado Livre derruba apps sem uso).
 */
export async function manterConexoes(supabase: Admin) {
  const resultados: Partial<Record<IdMarketplace, RespostaRotinaMarketplace>> = {}
  for (const canal of Object.keys(MARKETPLACES) as IdMarketplace[]) {
    const cred = await credenciais(supabase, canal)
    if (cred?.refresh_token) resultados[canal] = await verificarConexao(supabase, canal)
  }
  return resultados
}
