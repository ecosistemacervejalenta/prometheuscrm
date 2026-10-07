'use server'

import { revalidatePath } from 'next/cache'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'
import { formParaObjeto } from '@/lib/validacao'
import type { StatusMensagemWhatsapp } from '@/types'

import { statusDaUazapi } from './normalizacao'
import {
  esquemaConfigAtendimento,
  esquemaContato,
  esquemaEtiqueta,
  esquemaMensagem,
  esquemaMidia,
  esquemaNota,
  esquemaStatus,
  type CorEtiqueta,
  type DadosMidia,
} from './schema'
import { atualizarFoto, BUCKET_MIDIAS, fotoPrecisaAtualizar, guardarMidia, sincronizarConversa } from './sincronizacao'
import {
  configurarWebhook,
  enviarMidia,
  enviarTexto,
  ErroUazapi,
  marcarChatLido,
  type MensagemUazapi,
  type TipoMidiaUazapi,
} from './uazapi'

type Supabase = Awaited<ReturnType<typeof exigirEquipe>>['supabase']

function atualizarTelas() {
  revalidatePath('/atendimento')
}

function primeiroNome(nome: string | null | undefined) {
  const n = nome?.trim().split(/\s+/)[0] ?? ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}

/**
 * "*Ana:* " quando a assinatura está ligada (Configurações › Integrações).
 * O nome é o do responsável pelo atendimento; sem responsável, quem envia (e passa a ser o responsável).
 */
async function assinatura(supabase: Supabase, atendimentoId: string, nomeRemetente: string | null) {
  const [{ data: config }, { data: atendimento }] = await Promise.all([
    supabase.from('configuracoes').select('whatsapp_assinatura').eq('id', 1).maybeSingle(),
    supabase.from('atendimentos').select('perfis(nome)').eq('id', atendimentoId).maybeSingle(),
  ])
  const nome = primeiroNome(atendimento?.perfis?.nome ?? nomeRemetente)
  return config?.whatsapp_assinatura !== false && nome ? `*${nome}:* ` : ''
}

type MensagemParaEnvio = {
  id: string
  tipo: string
  texto: string | null
  midia_path: string | null
  midia_mime: string | null
  midia_nome: string | null
}

const TIPOS_UAZAPI: Record<string, TipoMidiaUazapi> = { imagem: 'image', video: 'video', documento: 'document' }

/** Manda à uazapi uma mensagem já registrada no CRM: texto, ou mídia por link assinado (15 min). */
async function despachar(supabase: Supabase, chatid: string, m: MensagemParaEnvio) {
  if (m.tipo === 'texto') return enviarTexto(chatid, m.texto ?? '', m.id)
  if (!m.midia_path) throw new Error('Arquivo não encontrado.')
  const { data, error } = await supabase.storage.from(BUCKET_MIDIAS).createSignedUrl(m.midia_path, 15 * 60)
  if (error || !data?.signedUrl) throw new Error('Não foi possível preparar o arquivo para envio.')
  // Áudio sem nome de arquivo = gravado no CRM → mensagem de voz.
  const tipo = m.tipo === 'audio' ? (m.midia_nome ? 'audio' : 'ptt') : (TIPOS_UAZAPI[m.tipo] ?? 'document')
  return enviarMidia(chatid, { tipo, url: data.signedUrl, legenda: m.texto, nomeArquivo: m.midia_nome, mime: m.midia_mime }, m.id)
}

/** Envia e marca o resultado. registrada = a mensagem já aparece na conversa ("Tentar de novo" se falhar). */
async function enviarRegistrada(supabase: Supabase, chatid: string, m: MensagemParaEnvio): Promise<EstadoAcao & { registrada: true }> {
  try {
    await confirmarEnvio(supabase, m.id, await despachar(supabase, chatid, m))
    atualizarTelas()
    return { ...sucesso(), registrada: true }
  } catch (e) {
    const erro = await registrarFalha(supabase, m.id, e)
    atualizarTelas()
    return { ...falha(erro), registrada: true }
  }
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

/** Envia texto pelo WhatsApp da loja, com o nome do atendente em negrito (se ligado). */
export async function enviarMensagem(atendimentoId: string, texto: string): Promise<EstadoAcao & { registrada?: boolean }> {
  const { supabase, perfil } = await exigirEquipe()
  const dados = esquemaMensagem.safeParse(texto)
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? 'Mensagem inválida.')

  const final = `${await assinatura(supabase, atendimentoId, perfil.nome)}${dados.data}`
  const { data, error } = await supabase.rpc('preparar_envio_whatsapp', { p_atendimento_id: atendimentoId, p_texto: final })
  if (error) return falha(traduzirErro(error))
  const { mensagem_id: id, chatid } = data as { mensagem_id: string; chatid: string }

  return enviarRegistrada(supabase, chatid, { id, tipo: 'texto', texto: final, midia_path: null, midia_mime: null, midia_nome: null })
}

/**
 * Envia foto, print, vídeo, documento, arquivo de áudio ou mensagem de voz gravada.
 * O navegador já subiu o arquivo para o bucket; a legenda recebe a assinatura.
 */
export async function enviarArquivo(atendimentoId: string, entrada: DadosMidia): Promise<EstadoAcao & { registrada?: boolean }> {
  const { supabase, perfil } = await exigirEquipe()
  const dados = esquemaMidia.safeParse(entrada)
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? 'Arquivo inválido.')
  const { caminho, tipo, mime, segundos, gravado, legenda } = dados.data

  const texto = legenda && tipo !== 'audio' ? `${await assinatura(supabase, atendimentoId, perfil.nome)}${legenda}` : null
  // Mensagem de voz fica sem nome; documentos sempre com nome (o cliente vê ao baixar).
  const nome = gravado ? null : dados.data.nome || (tipo === 'documento' ? caminho.split('/').pop()! : null)
  const midia = { tipo, path: caminho, mime, nome, segundos }

  const { data, error } = await supabase.rpc('preparar_envio_whatsapp', {
    p_atendimento_id: atendimentoId,
    p_texto: texto ?? '',
    p_midia: midia,
  })
  if (error) return falha(traduzirErro(error))
  const { mensagem_id: id, chatid } = data as { mensagem_id: string; chatid: string }

  return enviarRegistrada(supabase, chatid, { id, tipo, texto, midia_path: caminho, midia_mime: mime, midia_nome: nome })
}

/** Tenta de novo uma mensagem que falhou (mesmo conteúdo, mesma linha). */
export async function reenviarMensagem(mensagemId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: msg } = await supabase
    .from('whatsapp_mensagens')
    .select('id, tipo, texto, midia_path, midia_mime, midia_nome, status, whatsapp_contatos(chatid)')
    .eq('id', mensagemId)
    .maybeSingle()
  const chatid = msg?.whatsapp_contatos?.chatid
  if (!msg || msg.status !== 'falhou' || !chatid || !(msg.texto || msg.midia_path)) return falha('Esta mensagem não pode ser reenviada.')

  await supabase.from('whatsapp_mensagens').update({ status: 'enviando', erro: null }).eq('id', mensagemId)
  const r = await enviarRegistrada(supabase, chatid, msg)
  return r.ok ? sucesso('Mensagem enviada.') : r
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

// Etiquetas -------------------------------------------------------------------------

function atualizarTelasEtiquetas() {
  atualizarTelas()
  revalidatePath('/configuracoes/etiquetas')
}

/** Coloca ou tira uma etiqueta do atendimento (fica registrado na linha do tempo). */
export async function marcarEtiqueta(atendimentoId: string, etiquetaId: string, marcar: boolean): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('marcar_etiqueta_atendimento', {
    p_atendimento_id: atendimentoId,
    p_etiqueta_id: etiquetaId,
    p_marcar: marcar,
  })
  if (error) return falha(traduzirErro(error))
  atualizarTelasEtiquetas()
  return sucesso()
}

/** Cria a etiqueta pela própria conversa e já coloca no atendimento. */
export async function criarEtiquetaNoAtendimento(atendimentoId: string, nome: string, cor: CorEtiqueta): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaEtiqueta.safeParse({ nome, cor })
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? 'Etiqueta inválida.')

  const { data, error } = await supabase.from('etiquetas_atendimento').insert(dados.data).select('id').single()
  if (error) return falha(traduzirErro(error))
  const marcada = await supabase.rpc('marcar_etiqueta_atendimento', { p_atendimento_id: atendimentoId, p_etiqueta_id: data.id, p_marcar: true })
  atualizarTelasEtiquetas()
  if (marcada.error) return falha(`Etiqueta criada, mas não foi colocada no atendimento: ${traduzirErro(marcada.error)}`)
  return sucesso(`Etiqueta “${dados.data.nome}” criada.`)
}

export async function cadastrarEtiqueta(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaEtiqueta.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { error } = await supabase.from('etiquetas_atendimento').insert(dados.data)
  if (error) return falha(traduzirErro(error))
  atualizarTelasEtiquetas()
  return sucesso(`Etiqueta “${dados.data.nome}” cadastrada.`)
}

/** Renomeia ou troca a cor: muda em todos os atendimentos que usam a etiqueta. */
export async function editarEtiqueta(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaEtiqueta.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { error } = await supabase.from('etiquetas_atendimento').update(dados.data).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelasEtiquetas()
  return sucesso('Etiqueta atualizada.')
}

/** Exclui a etiqueta e tira ela de todos os atendimentos. */
export async function excluirEtiqueta(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('etiquetas_atendimento').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelasEtiquetas()
  return sucesso('Etiqueta excluída.')
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
  const { data: contato } = await supabase
    .from('whatsapp_contatos')
    .select('id, chatid, foto_url, foto_expira_em, foto_conferida_em')
    .eq('id', contatoId)
    .maybeSingle()
  if (!contato) return falha('Contato não encontrado.')
  try {
    const [novas, foto] = await Promise.all([
      sincronizarConversa(supabase, contato.chatid, { limite: silencioso ? 30 : 100, baixarMidias: 10 }),
      // Botão "Sincronizar" sempre confere a foto; ao abrir a conversa, só se o link estiver vencendo.
      !silencioso || fotoPrecisaAtualizar(contato) ? atualizarFoto(supabase, contato).then((url) => url !== contato.foto_url) : false,
    ])
    if (novas > 0 || foto) atualizarTelas()
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
