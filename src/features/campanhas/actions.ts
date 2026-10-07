'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'
import { formParaObjeto, whatsapp } from '@/lib/validacao'

import { acordarEnvios, pedirARotina } from './disparo'
import { esquemaCampanha, esquemaConexaoMeta, esquemaLoteContatos, type DadosCampanha } from './schema'
import { STATUS_ATIVOS, STATUS_EXCLUIVEIS } from './status'

function atualizarTelas(campanhaId?: string) {
  revalidatePath('/campanhas')
  revalidatePath('/configuracoes/whatsapp-oficial')
  if (campanhaId) revalidatePath(`/campanhas/${campanhaId}`)
}

// Conexão com a Meta ------------------------------------------------------------------

export async function salvarConexaoMeta(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const dados = esquemaConexaoMeta.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.rpc('salvar_whatsapp_oficial', {
    p_app_id: dados.data.app_id,
    p_phone_number_id: dados.data.phone_number_id,
    p_waba_id: dados.data.waba_id,
    p_token: dados.data.token ?? '',
    p_app_secret: dados.data.app_secret ?? '',
  })
  if (error) return falha(traduzirErro(error))

  // Confere na Meta com o que acabou de ser salvo (o token só o servidor lê).
  const verificacao = await pedirARotina(await urlDoSite(), { acao: 'verificar', pin: dados.data.pin })
  atualizarTelas()
  return verificacao.ok ? sucesso(verificacao.mensagem) : falha(verificacao.mensagem)
}

export async function verificarConexaoMeta(): Promise<EstadoAcao> {
  await exigirEquipe()
  const verificacao = await pedirARotina(await urlDoSite(), { acao: 'verificar' })
  atualizarTelas()
  return verificacao.ok ? sucesso(verificacao.mensagem) : falha(verificacao.mensagem)
}

export async function desconectarMeta(): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('desconectar_whatsapp_oficial')
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('WhatsApp oficial desconectado. As campanhas continuam no histórico.')
}

// Nova campanha (o navegador cria, manda os contatos em lotes e confirma) ---------------

type ResultadoCriacao = { ok: true } | { ok: false; mensagem: string }

/**
 * Cria a campanha com o id gerado no navegador. Repetida (ex.: "Tentar de novo"), atualiza a
 * mesma campanha enquanto ela está em preparo e recomeça os contatos — nada fica duplicado.
 */
export async function criarCampanha(dados: DadosCampanha): Promise<ResultadoCriacao> {
  const { supabase } = await exigirEquipe()
  const campanha = esquemaCampanha.safeParse(dados)
  if (!campanha.success) return { ok: false, mensagem: campanha.error.issues[0]?.message ?? 'Revise a campanha.' }

  const c = campanha.data
  const campos = {
    nome: c.nome,
    texto: c.texto,
    nome_padrao: c.nome_padrao,
    rodape: c.rodape || null,
    botao_texto: c.botao_texto,
    botao_url: c.botao_url,
    botao_sair: c.botao_sair,
    imagem_path: c.imagem_path,
    origem: c.origem,
    origem_descricao: c.origem_descricao,
    lista_id: c.origem === 'leads' ? c.lista_id : null,
    agendada_para: c.agendada_para,
  }

  const { data: existente } = await supabase.from('campanhas').select('status').eq('id', c.id).maybeSingle()
  if (existente && existente.status !== 'preparando') return { ok: false, mensagem: 'Esta campanha já foi confirmada.' }
  if (existente) {
    const limpeza = await supabase.from('campanha_envios').delete().eq('campanha_id', c.id)
    if (limpeza.error) return { ok: false, mensagem: traduzirErro(limpeza.error) }
    const { error } = await supabase.from('campanhas').update(campos).eq('id', c.id).eq('status', 'preparando')
    if (error) return { ok: false, mensagem: traduzirErro(error) }
  } else {
    const { error } = await supabase.from('campanhas').insert({ id: c.id, ...campos })
    if (error) return { ok: false, mensagem: traduzirErro(error) }
  }

  // Lista do Banco de Leads: em páginas de 5.000 (cada uma cabe no tempo limite do banco).
  if (c.origem === 'leads' && c.lista_id) {
    let apos: string | undefined
    do {
      const { data, error } = await supabase.rpc('adicionar_lista_campanha', { p_campanha_id: c.id, p_lista_id: c.lista_id, p_apos: apos })
      if (error) return { ok: false, mensagem: traduzirErro(error) }
      apos = (data as { ultimo: string | null }).ultimo ?? undefined
    } while (apos)
  }
  return { ok: true }
}

export async function adicionarContatosCampanha(campanhaId: string, lote: unknown): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const contatos = esquemaLoteContatos.safeParse(lote)
  if (!contatos.success) return falha('Lote de contatos inválido.')
  const { error } = await supabase.rpc('adicionar_contatos_campanha', { p_campanha_id: campanhaId, p_contatos: contatos.data })
  if (error) return falha(traduzirErro(error))
  return sucesso()
}

/** Fecha a lista de contatos e manda a mensagem para a análise da Meta. */
export async function confirmarCampanha(campanhaId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: campanha } = await supabase.from('campanhas').select('status').eq('id', campanhaId).maybeSingle()
  if (!campanha) return falha('Campanha não encontrada.')
  // Já confirmada (a resposta anterior se perdeu no caminho): segue para a página dela.
  if (campanha.status !== 'preparando') return sucesso()
  const { error } = await supabase.rpc('confirmar_campanha', { p_campanha_id: campanhaId })
  if (error) return falha(traduzirErro(error))

  // Confirmada, a campanha já existe: se a análise falhar, a página dela mostra o motivo e o "tentar de novo".
  // Sem revalidatePath: a tela vai direto para a página da campanha (renderizada na hora).
  const site = await urlDoSite()
  const analise = await pedirARotina(site, { acao: 'analisar', campanhaId })
  acordarEnvios(site)
  return sucesso(analise.mensagem)
}

// Acompanhamento ---------------------------------------------------------------------

export async function pausarCampanha(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('campanhas')
    .update({ status: 'pausada', pausada_motivo: 'equipe' })
    .eq('id', id)
    .in('status', STATUS_ATIVOS)
    .select('id')
  if (error) return falha(traduzirErro(error))
  if (data.length === 0) return falha('Esta campanha não está em andamento.')
  atualizarTelas(id)
  return sucesso('Campanha pausada. Nada mais é enviado até você retomar.')
}

export async function retomarCampanha(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: c } = await supabase.from('campanhas').select('status, modelo_status, agendada_para').eq('id', id).maybeSingle()
  if (!c || c.status !== 'pausada') return falha('Esta campanha não está pausada.')
  if (c.modelo_status === 'REJECTED' || c.modelo_status === 'DISABLED') {
    return falha('A Meta não aceita mais esta mensagem. Crie uma campanha nova com o texto ajustado.')
  }
  if (c.modelo_status === 'PAUSED') {
    return falha('A Meta ainda está com esta mensagem pausada por baixa qualidade. Ela libera sozinha em algumas horas — tente de novo depois.')
  }

  const aprovado = c.modelo_status === 'APPROVED'
  const futura = c.agendada_para !== null && new Date(c.agendada_para).getTime() > Date.now()
  const status = !aprovado ? 'aguardando_aprovacao' : futura ? 'agendada' : 'enviando'
  const { error } = await supabase
    .from('campanhas')
    .update({ status, pausada_motivo: null, ultimo_erro: null })
    .eq('id', id)
    .eq('status', 'pausada')
  if (error) return falha(traduzirErro(error))

  if (status === 'enviando') acordarEnvios(await urlDoSite())
  atualizarTelas(id)
  return sucesso(status === 'enviando' ? 'Envio retomado.' : 'Campanha retomada.')
}

export async function cancelarCampanha(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('campanhas')
    .update({ status: 'cancelada', pausada_motivo: null })
    .eq('id', id)
    .in('status', [...STATUS_ATIVOS, 'pausada'])
    .select('id')
  if (error) return falha(traduzirErro(error))
  if (data.length === 0) return falha('Esta campanha já terminou.')
  await supabase
    .from('campanha_envios')
    .update({ status: 'ignorada', erro: 'Campanha cancelada antes do envio.' })
    .eq('campanha_id', id)
    .eq('status', 'pendente')
  atualizarTelas(id)
  return sucesso('Campanha cancelada. Quem ainda não recebeu fica sem a mensagem.')
}

export async function excluirCampanha(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('campanhas').delete().eq('id', id).in('status', STATUS_EXCLUIVEIS).select('imagem_path')
  if (error) return falha(traduzirErro(error))
  if (data.length === 0) return falha('Só dá para excluir campanhas incompletas, canceladas ou recusadas.')
  // A foto só sai do Storage se nenhuma outra campanha usar o mesmo arquivo.
  const foto = data[0].imagem_path
  if (foto) {
    const { count } = await supabase.from('campanhas').select('id', { count: 'exact', head: true }).eq('imagem_path', foto)
    if (count === 0) await supabase.storage.from('campanhas').remove([foto])
  }
  atualizarTelas()
  redirect('/campanhas')
}

/** Manda a mensagem de novo para a análise (quando o envio para a Meta falhou). */
export async function reenviarParaAnalise(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('campanhas')
    .update({ status: 'aguardando_aprovacao', ultimo_erro: null })
    .eq('id', id)
    .eq('status', 'falhou')
    .select('id')
  if (error) return falha(traduzirErro(error))
  if (data.length === 0) return falha('Esta campanha não está esperando um novo envio para a Meta.')

  const site = await urlDoSite()
  const analise = await pedirARotina(site, { acao: 'analisar', campanhaId: id })
  acordarEnvios(site)
  atualizarTelas(id)
  return analise.ok ? sucesso(analise.mensagem) : falha(analise.mensagem)
}

export async function enviarTesteCampanha(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { perfil } = await exigirEquipe()
  const campanhaId = String(formData.get('campanha_id') ?? '')
  const numero = whatsapp.safeParse(formData.get('numero'))
  if (!numero.success) return { ok: false, erros: { numero: [numero.error.issues[0]?.message ?? 'WhatsApp inválido.'] } }

  const teste = await pedirARotina(await urlDoSite(), {
    acao: 'teste',
    campanhaId,
    numero: numero.data,
    nome: perfil.nome || 'Teste',
  })
  return teste.ok ? sucesso(teste.mensagem) : falha(teste.mensagem)
}
