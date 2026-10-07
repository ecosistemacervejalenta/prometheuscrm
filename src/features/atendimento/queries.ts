import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'
import { urlDoSite } from '@/lib/url'
import type { Json, StatusAtendimento } from '@/types'

import { CORES_ETIQUETA, type CorEtiqueta, type Etiqueta } from './schema'
import { BUCKET_MIDIAS } from './sincronizacao'
import {
  errosDoWebhook,
  EVENTOS_WEBHOOK,
  statusInstancia,
  uazapiConfigurada,
  webhooksConfigurados,
  type ErroWebhookUazapi,
} from './uazapi'

export type AbaAtendimento = 'fila' | 'meus' | 'abertos' | 'resolvidos'

export const ABAS_ATENDIMENTO: AbaAtendimento[] = ['fila', 'meus', 'abertos', 'resolvidos']

const ABERTOS: StatusAtendimento[] = ['fila', 'em_atendimento', 'aguardando_cliente']

/** Etiquetas vindas do banco (jsonb da visão ou relação embutida), com a cor conferida. */
function lerEtiquetas(valor: Json | Array<{ id: string; nome: string; cor: string } | null> | null): Etiqueta[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((e) => {
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.id !== 'string' || typeof e.nome !== 'string') return []
    const cor = CORES_ETIQUETA.includes(e.cor as CorEtiqueta) ? (e.cor as CorEtiqueta) : 'cinza'
    return [{ id: e.id, nome: e.nome, cor }]
  })
}

/** Busca por nome, número ou etiqueta: "(31) 98700" procura pelos dígitos. */
function filtroBusca(busca: string) {
  const digitos = busca.replace(/\D/g, '')
  return digitos.length >= 4 && !/[a-zà-ú]/i.test(busca) ? digitos : termoBusca(busca).toLowerCase()
}

export async function listarAtendimentos({ aba, busca }: { aba: AbaAtendimento; busca?: string }) {
  const { supabase, perfil } = await exigirEquipe()
  let consulta = supabase
    .from('vw_atendimentos')
    .select(
      'id, numero, status, nao_lidas, ultima_mensagem_em, ultima_mensagem_previa, ultima_mensagem_direcao, contato_nome, contato_foto, whatsapp, responsavel_id, responsavel_nome, criado_em, resolvido_em, etiquetas',
    )
    .limit(aba === 'resolvidos' ? 50 : 150)

  if (aba === 'fila') consulta = consulta.eq('status', 'fila')
  else if (aba === 'meus') consulta = consulta.eq('responsavel_id', perfil.id).in('status', ['em_atendimento', 'aguardando_cliente'])
  else if (aba === 'resolvidos') consulta = consulta.eq('status', 'resolvido')
  else consulta = consulta.in('status', ABERTOS)

  consulta =
    aba === 'resolvidos'
      ? consulta.order('resolvido_em', { ascending: false, nullsFirst: false })
      : consulta.order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
  if (busca) consulta = consulta.ilike('busca', `%${filtroBusca(busca)}%`)

  const { data, error } = await consulta
  if (error) throw error
  return data.map((a) => ({ ...a, etiquetas: lerEtiquetas(a.etiquetas) }))
}

export type ItemCaixaEntrada = Awaited<ReturnType<typeof listarAtendimentos>>[number]

/** Números das abas e o badge do menu (fila + meus com mensagens não lidas). */
export async function contagensAtendimento() {
  const { supabase, perfil } = await exigirEquipe()
  const contar = () => supabase.from('atendimentos').select('id', { count: 'exact', head: true })

  const [fila, meus, abertos, pendentes] = await Promise.all([
    contar().eq('status', 'fila'),
    contar().eq('responsavel_id', perfil.id).in('status', ['em_atendimento', 'aguardando_cliente']),
    contar().in('status', ABERTOS),
    contar().gt('nao_lidas', 0).in('status', ABERTOS).or(`status.eq.fila,responsavel_id.eq.${perfil.id}`),
  ])
  return { fila: fila.count ?? 0, meus: meus.count ?? 0, abertos: abertos.count ?? 0, pendentes: pendentes.count ?? 0 }
}

/** Membros da equipe (para nomes e para "Transferir para…"). */
export async function listarEquipe() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('perfis').select('id, nome, email, ativo').order('nome')
  if (error) throw error
  return data.map((p) => ({ id: p.id, nome: p.nome || p.email || 'Equipe', ativo: p.ativo }))
}

export type MembroEquipe = Awaited<ReturnType<typeof listarEquipe>>[number]

/** Conversa completa: atendimento atual + histórico do contato (todos os atendimentos). */
export async function obterConversa(id: string) {
  const { supabase } = await exigirEquipe()
  const { data: atendimento } = await supabase.from('vw_atendimentos').select('*').eq('id', id).maybeSingle()
  if (!atendimento?.contato_id) return null
  const contatoId = atendimento.contato_id

  const [contato, mensagens, atendimentos] = await Promise.all([
    supabase.from('whatsapp_contatos').select('*').eq('id', contatoId).single(),
    supabase
      .from('whatsapp_mensagens')
      .select(
        'id, atendimento_id, direcao, tipo, texto, midia_path, midia_mime, midia_nome, midia_segundos, midia_status, status, erro, enviada_por, enviada_em, criado_em',
      )
      .eq('contato_id', contatoId)
      .order('enviada_em', { ascending: false })
      .limit(400),
    supabase
      .from('atendimentos')
      .select(
        'id, numero, status, responsavel_id, assinatura_nome, criado_em, resolvido_em, atendimentos_etiquetas(etiquetas_atendimento(id, nome, cor))',
      )
      .eq('contato_id', contatoId)
      .order('criado_em'),
  ])
  if (contato.error) throw contato.error
  if (mensagens.error) throw mensagens.error
  if (atendimentos.error) throw atendimentos.error

  const idsAtendimentos = atendimentos.data.map((a) => a.id)
  const caminhos = mensagens.data.flatMap((m) => (m.midia_path ? [m.midia_path] : []))

  const [eventos, assinadas, cliente, lead] = await Promise.all([
    supabase
      .from('atendimento_eventos')
      .select('id, atendimento_id, tipo, autor_id, para_id, status, texto, criado_em')
      .in('atendimento_id', idsAtendimentos)
      .order('criado_em'),
    caminhos.length ? supabase.storage.from(BUCKET_MIDIAS).createSignedUrls(caminhos, 60 * 60 * 6) : null,
    atendimento.whatsapp
      ? supabase
          .from('vw_clientes')
          .select('id, nome, vip, pedidos, total_gasto, em_aberto, ultimo_pedido_em, cidade, uf, tags')
          .eq('whatsapp', atendimento.whatsapp)
          .maybeSingle()
      : null,
    contato.data.lead_id
      ? supabase
          .from('leads')
          .select('id, lista_id, leads_listas(id, nome, leads_pastas(id, nome))')
          .eq('id', contato.data.lead_id)
          .maybeSingle()
      : null,
  ])
  if (eventos.error) throw eventos.error

  const pedidos = cliente?.data?.id
    ? await supabase
        .from('vw_pedidos')
        .select('id, numero, total, status, status_pagamento, criado_em')
        .eq('cliente_id', cliente.data.id)
        .order('criado_em', { ascending: false })
        .limit(5)
    : null

  const urls: Record<string, string> = {}
  for (const a of assinadas?.data ?? []) if (a.path && a.signedUrl) urls[a.path] = a.signedUrl

  const listaLead = lead?.data?.leads_listas
  return {
    atendimento: {
      ...atendimento,
      etiquetas: lerEtiquetas(atendimento.etiquetas),
      // "Assinar como" (a view não traz: fica na própria tabela).
      assinatura_nome: atendimentos.data.find((a) => a.id === atendimento.id)?.assinatura_nome ?? null,
    },
    contato: contato.data,
    mensagens: mensagens.data.reverse().map((m) => ({
      ...m,
      midia_url: m.midia_path ? (urls[m.midia_path] ?? null) : null,
      // Download que não terminou em 2 min (histórico importado ou falha silenciosa): oferece "Baixar".
      midia_travada: m.midia_status === 'pendente' && Date.now() - new Date(m.criado_em).getTime() > 120_000,
    })),
    atendimentos: atendimentos.data.map(({ atendimentos_etiquetas, ...a }) => ({
      ...a,
      etiquetas: lerEtiquetas(atendimentos_etiquetas.map((v) => v.etiquetas_atendimento)),
    })),
    eventos: eventos.data,
    cliente: cliente?.data ?? null,
    pedidos: pedidos?.data ?? [],
    lead: lead?.data && listaLead
      ? { id: lead.data.id, listaId: listaLead.id, lista: listaLead.nome, pasta: listaLead.leads_pastas?.nome ?? null }
      : null,
  }
}

export type Conversa = NonNullable<Awaited<ReturnType<typeof obterConversa>>>
export type MensagemConversa = Conversa['mensagens'][number]
export type EventoConversa = Conversa['eventos'][number]

/** Etiquetas disponíveis para colocar nos atendimentos (ordem alfabética). */
export async function listarEtiquetas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('etiquetas_atendimento').select('id, nome, cor').order('nome')
  if (error) throw error
  return lerEtiquetas(data)
}

/** Etiquetas com quantos atendimentos abertos estão com ela e em quantos já foi usada. */
export async function listarEtiquetasComUso() {
  const { supabase } = await exigirEquipe()
  const [etiquetas, abertos] = await Promise.all([
    supabase.from('etiquetas_atendimento').select('id, nome, cor, atendimentos_etiquetas(count)').order('nome'),
    supabase.from('atendimentos_etiquetas').select('etiqueta_id, atendimentos!inner(status)').neq('atendimentos.status', 'resolvido'),
  ])
  if (etiquetas.error) throw etiquetas.error
  if (abertos.error) throw abertos.error

  const emAberto = new Map<string, number>()
  for (const u of abertos.data) emAberto.set(u.etiqueta_id, (emAberto.get(u.etiqueta_id) ?? 0) + 1)
  const total = new Map(etiquetas.data.map((e) => [e.id, e.atendimentos_etiquetas[0]?.count ?? 0]))

  return lerEtiquetas(etiquetas.data.map(({ id, nome, cor }) => ({ id, nome, cor }))).map((e) => ({
    ...e,
    abertos: emAberto.get(e.id) ?? 0,
    total: total.get(e.id) ?? 0,
  }))
}

export type EtiquetaComUso = Awaited<ReturnType<typeof listarEtiquetasComUso>>[number]

export async function configAtendimento() {
  const { supabase } = await exigirEquipe()
  const [config, pastas] = await Promise.all([
    supabase
      .from('configuracoes')
      .select('whatsapp_assinatura, whatsapp_nomes_assinatura, whatsapp_leads_automatico, whatsapp_pasta_leads_id')
      .eq('id', 1)
      .maybeSingle(),
    supabase.from('leads_pastas').select('id, nome').order('nome'),
  ])
  return {
    assinatura: config.data?.whatsapp_assinatura ?? true,
    nomesAssinatura: config.data?.whatsapp_nomes_assinatura ?? [],
    leadsAutomatico: config.data?.whatsapp_leads_automatico ?? true,
    pastaLeadsId: config.data?.whatsapp_pasta_leads_id ?? null,
    pastas: pastas.data ?? [],
  }
}

export type ConfigAtendimento = Awaited<ReturnType<typeof configAtendimento>>

/** Situação da integração para o cartão em Configurações › Integrações. */
export async function statusWhatsapp() {
  await exigirEquipe()
  const site = await urlDoSite()
  const urlWebhook = `${site}/api/webhooks/whatsapp`
  if (!uazapiConfigurada()) {
    return { configurado: false as const, urlWebhook, variaveisFaltando: ['UAZAPI_URL', 'UAZAPI_TOKEN'].filter((n) => !process.env[n]) }
  }

  const [instancia, webhooks, erros] = await Promise.allSettled([statusInstancia(), webhooksConfigurados(), errosDoWebhook()])
  const status = instancia.status === 'fulfilled' ? instancia.value : null
  const lista = webhooks.status === 'fulfilled' ? webhooks.value : []
  const nosso = lista.find((w) => w.url === urlWebhook)
  const eventosFaltando = nosso ? EVENTOS_WEBHOOK.filter((e) => !nosso.events?.includes(e)) : EVENTOS_WEBHOOK

  return {
    configurado: true as const,
    urlWebhook,
    erroConexao: instancia.status === 'rejected' ? (instancia.reason as Error).message : null,
    conectado: Boolean(status?.status?.connected && status.status.loggedIn),
    numero: status?.instance?.owner ?? null,
    perfil: status?.instance?.profileName ?? null,
    webhookAtivo: Boolean(nosso?.enabled) && eventosFaltando.length === 0,
    outrosWebhooks: lista.filter((w) => w.url && w.url !== urlWebhook).map((w) => w.url!),
    errosRecentes: (erros.status === 'fulfilled' ? erros.value : []).slice(0, 5) as ErroWebhookUazapi[],
  }
}

export type StatusWhatsapp = Awaited<ReturnType<typeof statusWhatsapp>>
