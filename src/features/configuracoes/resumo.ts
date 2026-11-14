import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { cache } from 'react'

import { situacaoWhatsapp } from '@/features/atendimento/components/cartao-whatsapp'
import { configAtendimento, listarEtiquetas, statusWhatsapp } from '@/features/atendimento/queries'
import { situacaoMeta } from '@/features/campanhas/components/cartao-conexao'
import { conexaoMeta } from '@/features/campanhas/queries'
import { resumoCepsVip } from '@/features/frete/queries'
import { situacaoMarketplace } from '@/features/marketplaces/components/cartao-marketplace'
import { statusMarketplaces } from '@/features/marketplaces/queries'
import { situacaoMercadoPago } from '@/features/mercado-pago/components/cartao-mercado-pago'
import { statusMercadoPago } from '@/features/mercado-pago/queries'
import { situacaoOlist } from '@/features/olist/components/cartao-olist'
import { resumoEstoqueOlist, statusOlist } from '@/features/olist/queries'
import { envServidor } from '@/lib/env.server'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import type { Tom } from '@/lib/rotulos'

import { GRUPOS_CONFIGURACOES, type ChaveSecao } from './navegacao'
import { listarEquipe, listarEventosRecentes, listarWebhooks, obterConfiguracoes } from './queries'

/**
 * Situação de cada seção para a visão geral das Configurações.
 * `atencao` só é preenchido quando algo que já funcionava parou ou falta um dado
 * que trava a operação — conexão nunca feita não é problema, é só "não conectado".
 */
export type SituacaoSecao = { tom: Tom; rotulo: string; ponto?: boolean; atencao?: string }

// Cada consulta roda uma vez por requisição, mesmo sendo usada por mais de um cartão.
const lerMercadoPago = cache(statusMercadoPago)
const lerOlist = cache(statusOlist)
const lerEstoqueOlist = cache(() => resumoEstoqueOlist().catch(() => null))
const lerWhatsapp = cache(statusWhatsapp)
const lerMarketplaces = cache(statusMarketplaces)
const lerMeta = cache(conexaoMeta)
const lerAtendimento = cache(configAtendimento)
const lerEtiquetas = cache(listarEtiquetas)
const lerCeps = cache(resumoCepsVip)
const lerWebhooks = cache(listarWebhooks)
const lerEventos = cache(listarEventosRecentes)
const lerEquipe = cache(listarEquipe)

const info = (rotulo: string): SituacaoSecao => ({ tom: 'neutro', rotulo })

/** Conexão: verde quando no ar, vermelho quando quebrou, neutro quando nunca foi feita. */
function deConexao(s: { tom: 'sucesso' | 'alerta' | 'perigo'; rotulo: string }, quebrada: string | false): SituacaoSecao {
  if (quebrada) return { tom: s.tom === 'sucesso' ? 'alerta' : s.tom, rotulo: s.rotulo, ponto: true, atencao: quebrada }
  return { tom: s.tom === 'sucesso' ? 'sucesso' : 'neutro', rotulo: s.rotulo, ponto: true }
}

const SITUACOES: Record<ChaveSecao, () => Promise<SituacaoSecao | null>> = {
  loja: async () => info((await obterConfiguracoes()).nome_loja),
  mensagens: async () => null,
  pagamento: async () => {
    const [config, mp] = await Promise.all([obterConfiguracoes(), lerMercadoPago()])
    if (mp.conectado && !mp.ultimo_erro) return { tom: 'sucesso', rotulo: 'PIX automático', ponto: true }
    if (config.chave_pix) return info('Chave PIX + comprovante')
    return {
      tom: 'alerta',
      rotulo: 'Sem chave PIX',
      ponto: true,
      atencao: 'O link da pré-venda está sem dados de pagamento: cadastre a chave PIX da loja.',
    }
  },
  frete: async () => {
    const [config, ceps] = await Promise.all([obterConfiguracoes(), lerCeps()])
    if (ceps.ceps_cobertos === 0) {
      return { tom: 'alerta', rotulo: 'Sem lista de CEPs', ponto: true, atencao: 'Nenhum CEP tem frete fixo: envie a planilha de CEPs do Frete VIP.' }
    }
    return info(`${formatarMoeda(config.frete_vip_valor)} · ${formatarNumero(ceps.ceps_cobertos)} CEPs`)
  },
  'caixa-vip': async () => {
    const dias = (await obterConfiguracoes()).caixa_prazo_pagamento_dias
    return info(dias > 0 ? `Cancela em ${dias} dia${dias === 1 ? '' : 's'}` : 'Nunca cancela')
  },
  whatsapp: async () => {
    const status = await lerWhatsapp()
    const s = situacaoWhatsapp(status)
    const quebrada = status.configurado && s.tom !== 'sucesso' && `WhatsApp da loja: ${s.rotulo.toLowerCase()}. As conversas podem não estar chegando no Atendimento.`
    return deConexao(s, quebrada)
  },
  atendimento: async () => info((await lerAtendimento()).rodizio ? 'Rodízio ligado' : 'Rodízio desligado'),
  etiquetas: async () => {
    const total = (await lerEtiquetas()).length
    return info(`${total} etiqueta${total === 1 ? '' : 's'}`)
  },
  olist: async () => {
    const [status, estoque] = await Promise.all([lerOlist(), lerEstoqueOlist()])
    const pendencias = status.conectado ? (estoque?.problemas.length ?? 0) : 0
    if (pendencias > 0) {
      return {
        tom: 'alerta',
        rotulo: `${pendencias} pendência${pendencias === 1 ? '' : 's'} de estoque`,
        ponto: true,
        atencao: `Olist: ${pendencias} lançamento(s) de estoque precisam de você.`,
      }
    }
    const quebrada = status.expirada
      ? 'A conexão com o Olist expirou: vendas por canal e estoque pararam de atualizar.'
      : status.conectado && status.ultimoErro
        ? 'A última sincronização com o Olist falhou.'
        : false
    return deConexao(situacaoOlist(status), quebrada)
  },
  shopify: async () =>
    envServidor.shopifyWebhookSecret ? { tom: 'sucesso', rotulo: 'Segredo configurado', ponto: true } : { tom: 'neutro', rotulo: 'Não configurado', ponto: true },
  'mercado-pago': async () => {
    const status = await lerMercadoPago()
    return deConexao(situacaoMercadoPago(status), Boolean(status.ultimo_erro) && 'O Mercado Pago recusou a última conferência: o PIX automático pode estar parado.')
  },
  'mercado-livre': async () => {
    const status = (await lerMarketplaces()).mercado_livre
    return deConexao(situacaoMarketplace(status), Boolean(status.ultimo_erro) && 'A conexão com o Mercado Livre está com erro.')
  },
  shopee: async () => {
    const status = (await lerMarketplaces()).shopee
    return deConexao(situacaoMarketplace(status), Boolean(status.ultimo_erro) && 'A conexão com a Shopee está com erro.')
  },
  'whatsapp-oficial': async () => {
    const conexao = await lerMeta()
    return deConexao(situacaoMeta(conexao), Boolean(conexao.ultimo_erro) && 'A Meta recusou a conexão do WhatsApp oficial: as campanhas não saem.')
  },
  webhooks: async () => {
    const [webhooks, eventos] = await Promise.all([lerWebhooks(), lerEventos()])
    const comErro = eventos.filter((e) => e.status === 'erro').length
    if (comErro > 0) {
      return {
        tom: 'alerta',
        rotulo: `${comErro} evento${comErro === 1 ? '' : 's'} com erro`,
        ponto: true,
        atencao: `Webhooks: ${comErro} evento(s) recente(s) não foram entregues.`,
      }
    }
    const ativos = webhooks.filter((w) => w.ativo).length
    return info(ativos > 0 ? `${ativos} ativo${ativos === 1 ? '' : 's'}` : 'Nenhum destino')
  },
  api: async () => (envServidor.apiKey ? { tom: 'sucesso', rotulo: 'Chave configurada', ponto: true } : { tom: 'neutro', rotulo: 'Sem chave', ponto: true }),
  perfil: async () => null,
  equipe: async () => {
    const equipe = await lerEquipe()
    const aguardando = equipe.filter((m) => !m.ativo).length
    if (aguardando > 0) {
      return {
        tom: 'alerta',
        rotulo: `${aguardando} aguardando`,
        ponto: true,
        atencao: `Equipe: ${aguardando} pessoa(s) aguardando liberação de acesso.`,
      }
    }
    return info(`${equipe.length} pessoa${equipe.length === 1 ? '' : 's'}`)
  },
}

/** Situação de uma seção. Uma consulta que falha não derruba a visão geral: a seção só fica sem etiqueta. */
export const situacaoDaSecao = cache(async (chave: ChaveSecao): Promise<SituacaoSecao | null> => {
  try {
    return await SITUACOES[chave]()
  } catch (erro) {
    // Redirecionamentos do Next (sessão expirada etc.) seguem o caminho normal.
    unstable_rethrow(erro)
    console.error(`[configuracoes] situação de ${chave}`, erro)
    return null
  }
})

/** Seções que pedem ação agora (para o quadro no topo da visão geral). */
export async function secoesQuePedemAtencao() {
  const secoes = GRUPOS_CONFIGURACOES.flatMap((g) => g.secoes)
  const situacoes = await Promise.all(secoes.map((s) => situacaoDaSecao(s.chave)))
  return secoes.flatMap((s, i) => {
    const atencao = situacoes[i]?.atencao
    return atencao ? [{ chave: s.chave, href: s.href, rotulo: s.rotulo, atencao }] : []
  })
}
