'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { errosDeValidacao, falha, sucesso, traduzirErro, type Credenciais, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { gerarSenhaTemporaria } from '@/lib/senha'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlDoSite } from '@/lib/url'
import { formParaObjeto, texto, textoOpcional, whatsappOpcional } from '@/lib/validacao'

import { enviarParaWebhook, processarFilaDeEventos } from '../integracoes/eventos'

// Loja --------------------------------------------------------------------------

const esquemaConfiguracoes = z.object({
  nome_loja: texto('Informe o nome da loja.'),
  whatsapp_loja: whatsappOpcional,
  chave_pix: textoOpcional,
  nome_recebedor_pix: textoOpcional,
  mensagem_pre_venda: texto('A mensagem não pode ficar vazia.'),
  mensagem_cobranca: texto('A mensagem não pode ficar vazia.'),
})

export async function salvarConfiguracoes(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaConfiguracoes.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.from('configuracoes').update(dados.data).eq('id', 1)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/', 'layout')
  return sucesso('Configurações salvas.')
}

// Webhooks (n8n, Zapier, App...) --------------------------------------------------

const EVENTOS_VALIDOS = [
  '*',
  'pedido.criado',
  'pedido.atualizado',
  'pedido.pago',
  'pedido.cancelado',
  'cliente.criado',
  'cliente.atualizado',
  'pre_venda.criada',
  'pre_venda.atualizada',
] as const

const esquemaWebhook = z.object({
  nome: texto('Dê um nome ao webhook.'),
  url: z.url({ protocol: /^https?$/, error: 'Informe uma URL válida (https://...).' }),
  eventos: z.array(z.enum(EVENTOS_VALIDOS)).min(1, 'Escolha pelo menos um evento.'),
})

export async function criarWebhook(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaWebhook.safeParse(formParaObjeto(formData, ['eventos']))
  if (!dados.success) return errosDeValidacao(dados.error)

  const eventos = dados.data.eventos.includes('*') ? ['*'] : dados.data.eventos
  const { error } = await supabase.from('webhooks').insert({ ...dados.data, eventos })
  if (error) return falha(traduzirErro(error))
  revalidatePath('/configuracoes', 'layout')
  return sucesso('Webhook cadastrado. Use o segredo para validar a assinatura no n8n.')
}

export async function alternarWebhook(id: string, ativo: boolean): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('webhooks').update({ ativo }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/configuracoes', 'layout')
  return sucesso(ativo ? 'Webhook ativado.' : 'Webhook pausado.')
}

export async function excluirWebhook(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('webhooks').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/configuracoes', 'layout')
  return sucesso('Webhook excluído.')
}

export async function testarWebhook(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: webhook } = await supabase.from('webhooks').select('*').eq('id', id).maybeSingle()
  if (!webhook) return falha('Webhook não encontrado.')

  const resultado = await enviarParaWebhook(webhook, {
    id: crypto.randomUUID(),
    tipo: 'teste.ping',
    criado_em: new Date().toISOString(),
    payload: { mensagem: 'Teste do Prometheus CRM', webhook: webhook.nome },
  })
  return resultado.ok ? sucesso('Teste enviado com sucesso (HTTP 2xx).') : falha(`Falha no teste: ${resultado.erro}`)
}

export async function processarFilaAgora(): Promise<EstadoAcao> {
  await exigirEquipe()
  try {
    const r = await processarFilaDeEventos(100)
    revalidatePath('/configuracoes/integracoes')
    return sucesso(`Fila processada: ${r.enviados} enviado(s), ${r.falhas} falha(s), ${r.ignorados} sem destino.`)
  } catch {
    return falha('Configure SUPABASE_SECRET_KEY no servidor para processar a fila.')
  }
}

export async function reenviarEvento(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase
    .from('eventos_integracao')
    .update({ status: 'pendente', tentativas: 0, proxima_tentativa_em: new Date().toISOString() })
    .eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/configuracoes/integracoes')
  return sucesso('Evento voltou para a fila.')
}

// Equipe --------------------------------------------------------------------------

const esquemaCadastro = z.object({
  nome: texto('Informe o nome.'),
  email: z.email('E-mail inválido.'),
  cargo: textoOpcional,
  papel: z.enum(['admin', 'equipe']),
})

/** Mensagem pronta para o admin repassar o acesso (ex.: pelo WhatsApp). */
async function credenciais(nome: string, email: string, senha: string): Promise<Credenciais> {
  const primeiroNome = nome.trim().split(/\s+/)[0]
  const mensagem = [
    `Olá, ${primeiroNome}! Seu acesso ao Prometheus CRM:`,
    `${await urlDoSite()}/login`,
    `E-mail: ${email}`,
    `Senha temporária: ${senha}`,
    'No primeiro acesso você vai criar a sua senha pessoal.',
  ].join('\n')
  return { nome, email, senha, mensagem }
}

/**
 * Cadastra a pessoa com uma senha temporária e já libera o acesso (somente administradores).
 * Sem e-mail: o admin repassa a senha e, no primeiro login, a pessoa cria a própria senha.
 */
export async function cadastrarMembro(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirAdmin()
  const dados = esquemaCadastro.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { nome, email, cargo, papel } = dados.data

  const senha = gerarSenhaTemporaria()
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (error) {
    return falha(
      error.code === 'email_exists'
        ? 'Este e-mail já tem cadastro. Para dar uma nova senha temporária, use “Nova senha” na lista de membros.'
        : `Não foi possível cadastrar: ${error.message}`,
    )
  }

  const { error: erroPerfil } = await admin
    .from('perfis')
    .update({ ativo: true, papel, cargo, nome, trocar_senha: true })
    .eq('id', data.user.id)
  if (erroPerfil) return falha(traduzirErro(erroPerfil))

  revalidatePath('/configuracoes/equipe')
  return { ok: true, mensagem: `Acesso de ${nome} criado.`, credenciais: await credenciais(nome, email, senha) }
}

/** Gera outra senha temporária para um membro (esqueceu a senha, convite antigo...). A senha atual deixa de valer. */
export async function gerarNovaSenha(id: string): Promise<EstadoAcao> {
  const { perfil } = await exigirAdmin()
  if (id === perfil.id) return falha('Você não pode gerar uma senha temporária para a sua própria conta.')

  const admin = createAdminClient()
  const { data: membro } = await admin.from('perfis').select('nome, email').eq('id', id).maybeSingle()
  if (!membro?.email) return falha('Membro não encontrado.')

  const senha = gerarSenhaTemporaria()
  // email_confirm: libera também contas de convites antigos por e-mail que nunca foram confirmados.
  const { error } = await admin.auth.admin.updateUserById(id, { password: senha, email_confirm: true })
  if (error) return falha(`Não foi possível gerar a senha: ${error.message}`)

  const { error: erroPerfil } = await admin.from('perfis').update({ trocar_senha: true }).eq('id', id)
  if (erroPerfil) return falha(traduzirErro(erroPerfil))

  revalidatePath('/configuracoes/equipe')
  return {
    ok: true,
    mensagem: 'Nova senha temporária gerada.',
    credenciais: await credenciais(membro.nome || membro.email, membro.email, senha),
  }
}

export async function atualizarAcessoMembro(
  id: string,
  mudanca: { ativo?: boolean; papel?: 'admin' | 'equipe' },
): Promise<EstadoAcao> {
  const { supabase, perfil } = await exigirAdmin()
  if (id === perfil.id) return falha('Você não pode alterar o seu próprio acesso.')
  const { error } = await supabase.from('perfis').update(mudanca).eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/configuracoes/equipe')
  return sucesso('Acesso atualizado.')
}

const esquemaMeuPerfil = z.object({ nome: texto('Informe seu nome.'), cargo: textoOpcional })

export async function salvarMeuPerfil(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase, perfil } = await exigirEquipe()
  const dados = esquemaMeuPerfil.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { error } = await supabase.from('perfis').update(dados.data).eq('id', perfil.id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/', 'layout')
  return sucesso('Perfil atualizado.')
}
