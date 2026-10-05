'use server'

import { revalidatePath } from 'next/cache'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'
import { formParaObjeto } from '@/lib/validacao'
import type { StatusMensagemWhatsapp } from '@/types'

import { statusDaUazapi } from './normalizacao'
import { esquemaConfigAtendimento, esquemaContato, esquemaMensagem, esquemaNota, esquemaStatus } from './schema'
import { guardarMidia, sincronizarConversa } from './sincronizacao'
import { configurarWebhook, enviarTexto, ErroUazapi, marcarChatLido, type MensagemUazapi } from './uazapi'

type Supabase = Awaited<ReturnType<typeof exigirEquipe>>['supabase']

function atualizarTelas() {
  revalidatePath('/atendimento')
}

function primeiroNome(nome: string | null | undefined) {
  const n = nome?.trim().split(/\s+/)[0] ?? ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}

/** Grava o id da uazapi na mensagem do CRM (o eco do webhook pode ter chegado antes). */
async function confirmarEnvio(supabase: Supabase, mensagemId: string, r: MensagemUazapi) {
  const { data: atual } = await supabase.from('whatsapp_mensagens').select('wa_id, status').eq('id', mensagemId).single()
  const status: StatusMensagemWhatsapp = statusDaUazapi(r.status) ?? 'enviada'
  const campos = {
    ...(!atual?.wa_id && r.id ? { wa_id: r.id, wa_messageid: r.messageid ?? null } : {}),
    ...(atual?.status === 'enviando' || atual?.status === 'falhou' ? { status: status === 'enviando' ? 'enviada' : status, erro: null } : {}),
  }
  if (!Object.keys(campos).length) return

  let { error } = await supabase.from('whatsapp_mensagens').update(campos).eq('id', mensagemId)
  if (error?.code === '23505' && r.id) {
    // O eco chegou sem track_id e virou outra linha: fica só a do CRM (com o autor).
    await supabase.from('whatsapp_mensagens').delete().eq('wa_id', r.id).neq('id', mensagemId)
    ;({ error } = await supabase.from('whatsapp_mensagens').update(campos).eq('id', mensagemId))
  }
  if (error) console.error('[whatsapp] envio não confirmado no CRM', error)
}

async function registrarFalha(supabase: Supabase, mensagemId: string, e: unknown) {
  const incerto = e instanceof ErroUazapi && /demorou/.test(e.message)
  const erro = incerto
    ? 'O WhatsApp não confirmou o envio. Confira no celular antes de tentar de novo.'
    : e instanceof Error
      ? e.message
      : 'Falha ao enviar.'
  await supabase.from('whatsapp_mensagens').update({ status: 'falhou', erro }).eq('id', mensagemId).eq('status', 'enviando')
  return erro
}

/**
 * Envia texto pelo WhatsApp da loja, com o nome do atendente em negrito (se ligado).
 * registrada = a mensagem já aparece na conversa (com "Tentar de novo" se falhar).
 */
export async function enviarMensagem(atendimentoId: string, texto: string): Promise<EstadoAcao & { registrada?: boolean }> {
  const { supabase, perfil } = await exigirEquipe()
  const dados = esquemaMensagem.safeParse(texto)
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? 'Mensagem inválida.')

  const { data: config } = await supabase.from('configuracoes').select('whatsapp_assinatura').eq('id', 1).maybeSingle()
  const nome = primeiroNome(perfil.nome)
  const final = config?.whatsapp_assinatura !== false && nome ? `*${nome}:* ${dados.data}` : dados.data

  const { data, error } = await supabase.rpc('preparar_envio_whatsapp', { p_atendimento_id: atendimentoId, p_texto: final })
  if (error) return falha(traduzirErro(error))
  const { mensagem_id: mensagemId, chatid } = data as { mensagem_id: string; chatid: string }

  try {
    await confirmarEnvio(supabase, mensagemId, await enviarTexto(chatid, final, mensagemId))
    atualizarTelas()
    return { ...sucesso(), registrada: true }
  } catch (e) {
    const erro = await registrarFalha(supabase, mensagemId, e)
    atualizarTelas()
    return { ...falha(erro), registrada: true }
  }
}

/** Tenta de novo uma mensagem que falhou (mesmo texto, mesma linha). */
export async function reenviarMensagem(mensagemId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: msg } = await supabase
    .from('whatsapp_mensagens')
    .select('id, texto, status, contato_id, whatsapp_contatos(chatid)')
    .eq('id', mensagemId)
    .maybeSingle()
  if (!msg?.texto || msg.status !== 'falhou' || !msg.whatsapp_contatos?.chatid) return falha('Esta mensagem não pode ser reenviada.')

  await supabase.from('whatsapp_mensagens').update({ status: 'enviando', erro: null }).eq('id', mensagemId)
  try {
    await confirmarEnvio(supabase, mensagemId, await enviarTexto(msg.whatsapp_contatos.chatid, msg.texto, mensagemId))
    atualizarTelas()
    return sucesso('Mensagem enviada.')
  } catch (e) {
    const erro = await registrarFalha(supabase, mensagemId, e)
    atualizarTelas()
    return falha(erro)
  }
}

/** Nota interna: aparece na conversa para a equipe, o cliente não vê. */
export async function adicionarNota(atendimentoId: string, texto: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaNota.safeParse(texto)
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? 'Nota inválida.')
  const { error } = await supabase.from('atendimento_eventos').insert({ atendimento_id: atendimentoId, tipo: 'nota', texto: dados.data })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso()
}

export async function assumirAtendimento(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('assumir_atendimento', { p_id: id })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Atendimento assumido.')
}

export async function transferirAtendimento(id: string, para: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('transferir_atendimento', { p_id: id, p_para: para })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Atendimento transferido.')
}

export async function alterarStatusAtendimento(id: string, status: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaStatus.safeParse(status)
  if (!dados.success) return falha('Status inválido.')
  const { error } = await supabase.rpc('alterar_status_atendimento', { p_id: id, p_status: dados.data })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  const textos = {
    fila: 'Atendimento devolvido para a fila.',
    em_atendimento: 'Atendimento em andamento.',
    aguardando_cliente: 'Marcado como aguardando o cliente.',
    resolvido: 'Atendimento resolvido.',
  }
  return sucesso(textos[dados.data])
}

/** Zera as não lidas ao abrir a conversa e avisa o WhatsApp (o cliente vê como lida). */
export async function marcarComoLido(id: string): Promise<void> {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('atendimentos')
    .update({ nao_lidas: 0 })
    .eq('id', id)
    .gt('nao_lidas', 0)
    .select('whatsapp_contatos(chatid)')
    .maybeSingle()
  const chatid = data?.whatsapp_contatos?.chatid
  if (chatid) await marcarChatLido(chatid).catch(() => undefined)
}

export async function salvarContato(contatoId: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaContato.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { error } = await supabase.from('whatsapp_contatos').update(dados.data).eq('id', contatoId)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Contato atualizado.')
}

export async function salvarComoLead(contatoId: string, pastaId: string | null): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('salvar_lead_whatsapp', { p_contato_id: contatoId, ...(pastaId ? { p_pasta_id: pastaId } : {}) })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  revalidatePath('/leads', 'layout')
  return sucesso('Salvo no Banco de Leads.')
}

/** Traz da uazapi mensagens que não chegaram pelo webhook (até 7 dias). */
export async function sincronizarConversaAgora(contatoId: string, { silencioso = false } = {}): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: contato } = await supabase.from('whatsapp_contatos').select('chatid').eq('id', contatoId).maybeSingle()
  if (!contato) return falha('Contato não encontrado.')
  try {
    const novas = await sincronizarConversa(supabase, contato.chatid, { limite: silencioso ? 30 : 100, baixarMidias: 10 })
    if (novas > 0) atualizarTelas()
    if (silencioso) return sucesso()
    return sucesso(novas > 0 ? `${novas} mensagem(ns) recuperada(s) do WhatsApp.` : 'A conversa já estava completa.')
  } catch (e) {
    return silencioso ? sucesso() : falha(e instanceof Error ? e.message : 'Não foi possível sincronizar.')
  }
}

export async function baixarMidiaNovamente(mensagemId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  await supabase.from('whatsapp_mensagens').update({ midia_status: 'pendente' }).eq('id', mensagemId).neq('midia_status', 'pronta')
  const ok = await guardarMidia(supabase, mensagemId)
  atualizarTelas()
  return ok ? sucesso() : falha('A mídia não está mais disponível no WhatsApp (a uazapi guarda por até 7 dias). Veja no celular.')
}

// Administração ---------------------------------------------------------------------

export async function ativarWebhookWhatsapp(): Promise<EstadoAcao> {
  await exigirAdmin()
  const site = await urlDoSite()
  if (!site.startsWith('https://') || /localhost|127\.0\.0\.1/.test(site)) {
    return falha('Ative o webhook pelo CRM publicado (endereço https da Vercel), não pelo ambiente local.')
  }
  try {
    await configurarWebhook(`${site}/api/webhooks/whatsapp`)
  } catch (e) {
    return falha(e instanceof Error ? e.message : 'Não foi possível configurar o webhook.')
  }
  revalidatePath('/configuracoes/integracoes')
  return sucesso('Webhook ativado: as mensagens novas já chegam no Atendimento.')
}

export async function salvarConfigAtendimento(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const dados = esquemaConfigAtendimento.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  if (dados.data.whatsapp_leads_automatico && !dados.data.whatsapp_pasta_leads_id) {
    return falha('Escolha a pasta do Banco de Leads para salvar os contatos automaticamente.')
  }
  const { error } = await supabase.from('configuracoes').update(dados.data).eq('id', 1)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/configuracoes/integracoes')
  return sucesso('Configurações do atendimento salvas.')
}
