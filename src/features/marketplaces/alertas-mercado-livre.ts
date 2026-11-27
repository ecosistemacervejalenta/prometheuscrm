import 'server-only'

import { entregarEventoAgora, type EntregaEvento } from '@/features/integracoes/eventos'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types'

import * as ml from './mercado-livre'
import { acessoMercadoLivre } from './rotina'

/**
 * Alertas do Mercado Livre no grupo da equipe (WhatsApp).
 *
 * O Mercado Livre avisa o CRM (/api/webhooks/mercado-livre) e o CRM busca o detalhe:
 *   • questions      → pergunta nova em anúncio (status UNANSWERED);
 *   • messages       → mensagem pós-venda recebida (subtópico "created");
 *   • post_purchase  → reclamação, devolução, troca ou cancelamento aberto pelo comprador,
 *                      e de novo quando a reclamação vai para mediação com o Mercado Livre.
 * Quem fala com o grupo é o n8n: o CRM manda o evento mercado_livre.alerta pela fila de webhooks
 * com a mensagem pronta (o mesmo caminho dos avisos de validade dos lotes). Cada coisa avisa uma
 * vez só (tabela ml_alertas, coluna chave) — o Mercado Livre repete notificações.
 *
 * Doc: developers.mercadolivre.com.br/pt_br/produto-receba-notificacoes, /mensagens-post-venda,
 * /gerenciar-reclamacoes.
 */

type Admin = ReturnType<typeof createAdminClient>

export type NotificacaoMercadoLivre = {
  resource?: string
  user_id?: number | string
  topic?: string
  actions?: string[]
  application_id?: number | string
  attempts?: number
  sent?: string
}

export type TipoAlertaMl = 'pergunta' | 'mensagem' | 'reclamacao' | 'teste'

/** Páginas do vendedor no site do Mercado Livre (botão da mensagem no grupo). */
export const LINKS_ML = {
  perguntas: 'https://www.mercadolivre.com.br/perguntas/vendedor',
  venda: (id: string) => `https://www.mercadolivre.com.br/vendas/${id}/detalhe`,
  vendas: 'https://www.mercadolivre.com.br/vendas/omni/lista',
}

const RODAPE = 'Prometheus CRM · Mercado Livre'
/** Texto do comprador no alerta: o bastante para entender o assunto sem poluir o grupo. */
const MAX_TEXTO = 600

/** Rótulo de cada tipo de reclamação (type) — cancel_sale é do próprio vendedor e não avisa. */
const TIPOS_RECLAMACAO: Record<string, string> = {
  mediations: 'Reclamação aberta',
  returns: 'Devolução solicitada',
  return: 'Devolução solicitada',
  change: 'Troca solicitada',
  fulfillment: 'Reclamação aberta (Full)',
  ml_case: 'Cancelamento por atraso no envio',
  cancel_purchase: 'Compra cancelada pelo comprador',
  service: 'Cancelamento de serviço',
}

// ---------------------------------------------------------------------------------------------
// Respostas da API (só os campos usados)

type Pergunta = {
  id: number
  seller_id?: number
  item_id?: string
  text?: string
  status?: string
  date_created?: string
  from?: { id?: number }
}

type Item = { id?: string; title?: string; permalink?: string }

type MensagemNova = {
  id?: string
  from?: { user_id?: number | string }
  text?: string | { plain?: string }
  status?: string
  message_date?: { created?: string; received?: string }
  message_resources?: { id?: string | number; name?: string }[]
}

type MensagemAntiga = {
  message_id?: string
  from?: { user_id?: number | string }
  text?: { plain?: string } | string
  status?: string
  date_created?: string
  date?: string
  resource?: string
  resource_id?: string | number
}

type RespostaMensagem = (MensagemAntiga & { messages?: MensagemNova[] | null }) | null

type Pedido = {
  id: number
  pack_id?: number | null
  total_amount?: number
  buyer?: { id?: number; nickname?: string }
  order_items?: { item?: { id?: string; title?: string }; quantity?: number }[]
}

type Pacote = { id?: number; orders?: { id?: number }[] }

type Reclamacao = {
  id: number
  resource_id?: number
  resource?: string
  status?: string
  type?: string
  stage?: string
  reason_id?: string
  date_created?: string
  players?: { role?: string; type?: string; user_id?: number }[]
}

type DetalheReclamacao = { due_date?: string | null; action_responsible?: string; title?: string; description?: string; problem?: string }
type MotivoReclamacao = { detail?: string }
type Reputacao = { affects_reputation?: string; has_incentive?: boolean; due_date?: string | null }

// ---------------------------------------------------------------------------------------------
// Montagem da mensagem

export type AlertaMl = {
  tipo: TipoAlertaMl
  chave: string
  recurso: string | null
  titulo: string
  link: string | null
  mensagem: string
  detalhes: Record<string, Json>
}

function citar(texto: string | null | undefined): string | null {
  const limpo = (texto ?? '').replace(/\s+\n/g, '\n').trim()
  if (!limpo) return null
  const curto = limpo.length > MAX_TEXTO ? `${limpo.slice(0, MAX_TEXTO).trimEnd()}…` : limpo
  // Itálico do WhatsApp em cada linha (o "_" não atravessa quebras de linha).
  return curto
    .split('\n')
    .map((linha) => (linha.trim() ? `_${linha.trim().replace(/_/g, ' ')}_` : ''))
    .join('\n')
}

function itensDoPedido(pedido: Pedido | null): string | null {
  const itens = pedido?.order_items ?? []
  if (!itens.length) return null
  return itens.map((i) => `${i.quantity ?? 1}x ${i.item?.title ?? 'item'}`).join(', ')
}

function linhas(...partes: (string | null | undefined | false)[]) {
  return partes.filter((p): p is string => typeof p === 'string').join('\n')
}

/** Corpo do evento mercado_livre.alerta (o n8n manda `mensagem` e, se houver, o botão). */
export function payloadDoAlerta(alerta: AlertaMl): Json {
  return {
    mensagem: alerta.mensagem,
    botao: alerta.link ? { texto: 'Abrir no Mercado Livre', url: alerta.link } : null,
    rodape: RODAPE,
    tipo: alerta.tipo,
    teste: alerta.tipo === 'teste',
    titulo: alerta.titulo,
    link: alerta.link,
    detalhes: alerta.detalhes,
  }
}

// ---------------------------------------------------------------------------------------------
// Consultas auxiliares (falhas aqui só deixam o alerta com menos detalhe)

async function tentar<T>(promessa: Promise<T | null>): Promise<T | null> {
  try {
    return await promessa
  } catch (erro) {
    if (erro instanceof ml.AutorizacaoExpirada) throw erro
    console.error('[mercado-livre] consulta auxiliar falhou', erro)
    return null
  }
}

/** Pedido a partir do id do pacote (pack) ou do próprio pedido — o ML usa os dois. */
async function pedidoDoPacote(acesso: string, id: string): Promise<Pedido | null> {
  const pacote = await tentar(ml.consultar<Pacote>(acesso, `/packs/${id}`))
  const pedidoId = pacote?.orders?.[0]?.id ?? id
  return tentar(ml.consultar<Pedido>(acesso, `/orders/${pedidoId}`))
}

// ---------------------------------------------------------------------------------------------
// Cada tópico

async function alertaDePergunta(acesso: string, contaId: string, recurso: string): Promise<AlertaMl | null> {
  const id = recurso.match(/questions\/(\d+)/)?.[1]
  if (!id) return null
  const pergunta = await ml.consultar<Pergunta>(acesso, `/questions/${id}?api_version=4`)
  if (!pergunta || pergunta.status !== 'UNANSWERED') return null
  if (contaId && pergunta.seller_id && String(pergunta.seller_id) !== contaId) return null

  const item = pergunta.item_id ? await tentar(ml.consultar<Item>(acesso, `/items/${pergunta.item_id}?attributes=id,title,permalink`)) : null
  const anuncio = item?.title ?? pergunta.item_id ?? 'anúncio'

  const mensagem = linhas(
    '🚨 *ALERTA · MERCADO LIVRE*',
    '❓ *Pergunta nova em um anúncio*',
    '',
    `📦 Anúncio: *${anuncio}*`,
    citar(pergunta.text) && `💬 ${citar(pergunta.text)}`,
    pergunta.date_created && `🕒 ${formatarDataHora(pergunta.date_created)}`,
    '',
    '👉 Responda pelo Mercado Livre o quanto antes — pergunta respondida rápido vende mais.',
  )
  return {
    tipo: 'pergunta',
    chave: `pergunta:${id}`,
    recurso: `/questions/${id}`,
    titulo: `Pergunta em ${anuncio}`,
    link: LINKS_ML.perguntas,
    mensagem,
    detalhes: { pergunta_id: id, item_id: pergunta.item_id ?? null, anuncio, texto: pergunta.text ?? null },
  }
}

async function alertaDeMensagem(acesso: string, contaId: string, recurso: string): Promise<AlertaMl | null> {
  const id = recurso.replace(/^\/?messages\//, '').split(/[/?]/)[0]
  if (!id) return null
  const resposta = await ml.consultar<RespostaMensagem>(acesso, `/messages/${id}?tag=post_sale`)
  if (!resposta) return null

  // Formato novo ({ messages: [...] }) ou antigo (a própria mensagem).
  const nova = resposta.messages?.[0]
  const remetente = String((nova?.from ?? resposta.from)?.user_id ?? '')
  if (contaId && remetente === contaId) return null // mensagem da própria loja
  const bruto = nova ? nova.text : resposta.text
  const texto = typeof bruto === 'string' ? bruto : (bruto?.plain ?? '')
  const quando = nova?.message_date?.created ?? nova?.message_date?.received ?? resposta.date_created ?? resposta.date ?? null
  const pacoteId =
    nova?.message_resources?.find((r) => r.name === 'packs')?.id ??
    nova?.message_resources?.find((r) => r.name === 'orders')?.id ??
    (resposta.resource === 'orders' || resposta.resource === 'packs' ? resposta.resource_id : undefined)

  const pedido = pacoteId ? await pedidoDoPacote(acesso, String(pacoteId)) : null
  const venda = String(pedido?.pack_id ?? pedido?.id ?? pacoteId ?? '')
  const itens = itensDoPedido(pedido)

  const mensagem = linhas(
    '🚨 *ALERTA · MERCADO LIVRE*',
    '✉️ *Mensagem nova de comprador* (pós-venda)',
    '',
    venda && `🧾 Venda #${venda}${pedido?.buyer?.nickname ? ` · ${pedido.buyer.nickname}` : ''}`,
    itens && `📦 ${itens}`,
    citar(texto) ? `💬 ${citar(texto)}` : '💬 (mensagem sem texto — pode ser um anexo)',
    quando && `🕒 ${formatarDataHora(quando)}`,
    '',
    '👉 Responda pelo Mercado Livre o quanto antes (a conversa pode ser bloqueada depois de 48 h úteis sem resposta).',
  )
  return {
    tipo: 'mensagem',
    chave: `mensagem:${id}`,
    recurso: `/messages/${id}`,
    titulo: venda ? `Mensagem na venda #${venda}` : 'Mensagem de comprador',
    link: venda ? LINKS_ML.venda(venda) : null,
    mensagem,
    detalhes: { mensagem_id: id, venda: venda || null, comprador: pedido?.buyer?.nickname ?? null, itens, texto: texto || null },
  }
}

export async function alertaDeReclamacao(acesso: string, contaId: string, claimId: string): Promise<AlertaMl | null> {
  const reclamacao = await ml.consultar<Reclamacao>(acesso, `/post-purchase/v1/claims/${claimId}`)
  if (!reclamacao || reclamacao.status !== 'opened') return null
  if (reclamacao.type === 'cancel_sale') return null
  // Só quando a loja é quem responde (não quando ela mesma reclamou de uma compra).
  if (contaId && reclamacao.players?.length) {
    const daLoja = reclamacao.players.find((p) => String(p.user_id ?? '') === contaId)
    if (daLoja && daLoja.role !== 'respondent') return null
  }

  const mediacao = reclamacao.stage === 'dispute'
  const [detalhe, motivo, reputacao] = await Promise.all([
    tentar(ml.consultar<DetalheReclamacao>(acesso, `/post-purchase/v1/claims/${claimId}/detail`)),
    reclamacao.reason_id ? tentar(ml.consultar<MotivoReclamacao>(acesso, `/post-purchase/v1/claims/reasons/${reclamacao.reason_id}`)) : null,
    tentar(ml.consultar<Reputacao>(acesso, `/post-purchase/v1/claims/${claimId}/affects-reputation`)),
  ])
  const pedido =
    reclamacao.resource === 'order' && reclamacao.resource_id
      ? await tentar(ml.consultar<Pedido>(acesso, `/orders/${reclamacao.resource_id}`))
      : null

  const tipo = TIPOS_RECLAMACAO[reclamacao.type ?? ''] ?? 'Reclamação aberta'
  const venda = String(pedido?.pack_id ?? pedido?.id ?? reclamacao.resource_id ?? '')
  const itens = itensDoPedido(pedido)
  const prazo = detalhe?.due_date ?? reputacao?.due_date ?? null
  const problema = detalhe?.problem || motivo?.detail || null
  const afeta =
    reputacao?.affects_reputation === 'affected'
      ? reputacao.has_incentive
        ? 'sim — mas não pesa se resolver bem em até 48 h'
        : 'sim'
      : reputacao?.affects_reputation === 'not_affected'
        ? 'não'
        : null
  const responsavel =
    detalhe?.action_responsible === 'seller'
      ? 'a loja (nós)'
      : detalhe?.action_responsible === 'buyer'
        ? 'o comprador'
        : detalhe?.action_responsible === 'mediator'
          ? 'o Mercado Livre'
          : null

  const mensagem = linhas(
    mediacao ? '🚨🚨 *ALERTA · MEDIAÇÃO NO MERCADO LIVRE* 🚨🚨' : '🚨🚨 *ALERTA · RECLAMAÇÃO NO MERCADO LIVRE* 🚨🚨',
    mediacao ? '⚖️ *A reclamação foi para mediação com o Mercado Livre*' : `⚠️ *${tipo}*`,
    '',
    venda && `🧾 Venda #${venda}${pedido?.buyer?.nickname ? ` · ${pedido.buyer.nickname}` : ''}`,
    itens && `📦 ${itens}`,
    pedido?.total_amount != null && `💰 ${formatarMoeda(pedido.total_amount)}`,
    problema && `❗ Motivo: ${problema}`,
    detalhe?.title && `📌 Situação: ${detalhe.title}`,
    responsavel && `👤 Próximo passo com: ${responsavel}`,
    prazo && `⏰ Prazo: *${formatarDataHora(prazo)}*`,
    afeta && `📉 Afeta a reputação: ${afeta}`,
    '',
    '👉 Responda pelo Mercado Livre dentro do prazo — reclamação sem resposta pesa na reputação da loja.',
  )
  return {
    tipo: 'reclamacao',
    chave: `reclamacao:${claimId}:${mediacao ? 'mediacao' : 'aberta'}`,
    recurso: `/post-purchase/v1/claims/${claimId}`,
    titulo: `${mediacao ? 'Mediação' : tipo}${venda ? ` · venda #${venda}` : ''}`,
    link: venda ? LINKS_ML.venda(venda) : LINKS_ML.vendas,
    mensagem,
    detalhes: {
      reclamacao_id: claimId,
      tipo: reclamacao.type ?? null,
      etapa: reclamacao.stage ?? null,
      venda: venda || null,
      comprador: pedido?.buyer?.nickname ?? null,
      itens,
      motivo: problema,
      prazo,
      afeta_reputacao: reputacao?.affects_reputation ?? null,
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Gravar e entregar

/** Grava o alerta (uma vez só) e entrega ao n8n na hora. Nulo quando já tinha sido dado. */
export async function registrarEEntregar(supabase: Admin, alerta: AlertaMl, perfilId?: string): Promise<EntregaEvento | null> {
  const { data: eventoId, error } = await supabase.rpc('registrar_alerta_ml', {
    p_tipo: alerta.tipo,
    p_chave: alerta.chave,
    p_recurso: alerta.recurso,
    p_titulo: alerta.titulo,
    p_link: alerta.link,
    p_payload: payloadDoAlerta(alerta),
    p_criado_por: perfilId ?? null,
  })
  if (error) throw error
  if (!eventoId) return null
  return entregarEventoAgora(eventoId)
}

/** Processa uma notificação do Mercado Livre (já respondida com 200). */
export async function processarNotificacaoMercadoLivre(supabase: Admin, aviso: NotificacaoMercadoLivre | null) {
  if (!aviso?.topic || !aviso.resource) return
  const { data: conexao } = await supabase
    .from('integracao_marketplace')
    .select('client_id, conta_id')
    .eq('canal', 'mercado_livre')
    .maybeSingle()
  // Avisos de outro app ou de outra conta são ignorados.
  if (!conexao?.client_id || String(aviso.application_id ?? '') !== conexao.client_id) return
  await supabase.from('integracao_marketplace').update({ notificacao_recebida_em: new Date().toISOString() }).eq('canal', 'mercado_livre')
  if (conexao.conta_id && aviso.user_id != null && String(aviso.user_id) !== conexao.conta_id) return

  const topico = aviso.topic
  const quer =
    topico === 'questions' ||
    (topico === 'messages' && !(aviso.actions?.length && !aviso.actions.includes('created'))) ||
    topico === 'post_purchase' ||
    topico === 'claims'
  if (!quer) return

  const conta = await acessoMercadoLivre(supabase)
  if (!conta) return

  let alerta: AlertaMl | null = null
  if (topico === 'questions') alerta = await alertaDePergunta(conta.acesso, conta.contaId, aviso.resource)
  else if (topico === 'messages') alerta = await alertaDeMensagem(conta.acesso, conta.contaId, aviso.resource)
  else {
    const claimId = aviso.resource.match(/claims\/(\d+)/)?.[1]
    if (claimId) alerta = await alertaDeReclamacao(conta.acesso, conta.contaId, claimId)
  }
  if (!alerta) return

  const entrega = await registrarEEntregar(supabase, alerta)
  if (entrega?.status === 'falhou') console.error('[mercado-livre] alerta não chegou ao n8n (fica na fila)', entrega.erro)
}

// ---------------------------------------------------------------------------------------------
// Conferência periódica (rede de segurança se uma notificação se perder)

const JANELA_CONFERENCIA_MS = 48 * 3600_000

type BuscaReclamacoes = { data?: Reclamacao[] }
type BuscaPerguntas = { questions?: Pergunta[] }

/** Data no formato que a busca de reclamações exige (com milissegundos e fuso). */
function dataComMilissegundos(d: Date) {
  return d.toISOString().replace('Z', '+00:00')
}

/**
 * Reclamações abertas e perguntas sem resposta das últimas 48 h que ainda não viraram alerta.
 * A chave do alerta impede repetir o que já foi avisado.
 */
export async function conferirAlertasMercadoLivre(supabase: Admin) {
  const conta = await acessoMercadoLivre(supabase)
  if (!conta?.contaId) return { conectado: false, novos: 0 }
  const desde = new Date(Date.now() - JANELA_CONFERENCIA_MS)
  let novos = 0
  const erros: string[] = []

  try {
    const reclamacoes = await ml.consultar<BuscaReclamacoes>(
      conta.acesso,
      `/post-purchase/v1/claims/search?${new URLSearchParams({
        'players.user_id': conta.contaId,
        'players.role': 'respondent',
        status: 'opened',
        range: `last_updated:after:${dataComMilissegundos(desde)}`,
        limit: '50',
      })}`,
    )
    for (const r of reclamacoes?.data ?? []) {
      const alerta = await alertaDeReclamacao(conta.acesso, conta.contaId, String(r.id)).catch((e) => {
        console.error('[mercado-livre] conferência de reclamação falhou', r.id, e)
        return null
      })
      if (alerta && (await registrarEEntregar(supabase, alerta))) novos++
    }
  } catch (e) {
    console.error('[mercado-livre] busca de reclamações falhou', e)
    erros.push(`reclamações: ${e instanceof Error ? e.message : 'erro'}`)
  }

  try {
    const perguntas = await ml.consultar<BuscaPerguntas>(
      conta.acesso,
      `/questions/search?${new URLSearchParams({
        seller_id: conta.contaId,
        status: 'UNANSWERED',
        sort_fields: 'date_created',
        sort_types: 'DESC',
        limit: '50',
        api_version: '4',
      })}`,
    )
    for (const p of perguntas?.questions ?? []) {
      if (!p.date_created || new Date(p.date_created).getTime() < desde.getTime()) continue
      const alerta = await alertaDePergunta(conta.acesso, conta.contaId, `/questions/${p.id}`).catch(() => null)
      if (alerta && (await registrarEEntregar(supabase, alerta))) novos++
    }
  } catch (e) {
    console.error('[mercado-livre] busca de perguntas falhou', e)
    erros.push(`perguntas: ${e instanceof Error ? e.message : 'erro'}`)
  }

  return { conectado: true, novos, erros }
}

// ---------------------------------------------------------------------------------------------
// Teste pela tela

export function alertaDeTeste(): AlertaMl {
  const mensagem = linhas(
    '🧪 *MENSAGEM DE TESTE* — pode ignorar',
    '',
    '🚨 *ALERTA · MERCADO LIVRE*',
    '❓ *Pergunta nova em um anúncio*',
    '',
    '📦 Anúncio: *Cerveja de exemplo 500 ml*',
    '💬 _Boa tarde! Vocês entregam em Campinas ainda esta semana?_',
    `🕒 ${formatarDataHora(new Date().toISOString())}`,
    '',
    '👉 É assim que vão chegar os avisos de pergunta, mensagem de comprador e reclamação do Mercado Livre.',
  )
  return {
    tipo: 'teste',
    chave: `teste:${crypto.randomUUID()}`,
    recurso: null,
    titulo: 'Mensagem de teste',
    link: LINKS_ML.perguntas,
    mensagem,
    detalhes: {},
  }
}
