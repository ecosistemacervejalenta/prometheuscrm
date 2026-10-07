import 'server-only'

import { formatarWhatsapp } from '@/lib/format'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Campanha } from '@/types'

import {
  buscarModeloPorNome,
  criarModelo,
  enviarExemploImagem,
  enviarModelo,
  ErroMeta,
  inscreverApp,
  lerModelo,
  lerNumero,
  registrarNumero,
  type CredenciaisMeta,
  type ModeloMeta,
  type ModeloParaEnvio,
  type NumeroMeta,
} from './api-meta'
import type { RespostaRotina } from './disparo'
import { classeDoErro, ERRO_SAIU_DO_MARKETING, mensagemDoErro, motivoDaRecusa, type ClasseErro } from './erros-meta'
import { urlImagemCampanha } from './mensagem'
import { faixaDoLimite, limiteDiario } from './meta'
import { assinaturaDoModelo, componentesDoEnvio, corpoDoModelo, IDIOMA_MODELO, nomeDoModelo } from './modelo-meta'

/**
 * Rotina das Campanhas (roda só no servidor, com a chave secreta do Supabase):
 * confere a conexão, manda modelos para a análise da Meta, libera campanhas
 * aprovadas ou agendadas e envia a fila em lotes, respeitando o limite diário.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Uma rodada de envio dura até 4 min (a rota tem 5) e a Vercel Cron chama a cada 5 min. */
const PRAZO_MS = 240_000
const LOTE = 60
/** Envios simultâneos (~30 mensagens/s, abaixo das 80/s da Meta). */
const SIMULTANEOS = 10
const MAX_TENTATIVAS = 5
const CONFERIR_NUMERO_A_CADA_MS = 30 * 60_000

const agora = () => new Date().toISOString()

// Credenciais -----------------------------------------------------------------------------

type LinhaCredenciais = {
  app_id: string | null
  phone_number_id: string | null
  waba_id: string | null
  token: string | null
  app_secret: string | null
  token_verificacao: string | null
}

export async function lerCredenciais(supabase: Admin): Promise<LinhaCredenciais | null> {
  const { data, error } = await supabase.rpc('credenciais_whatsapp_oficial')
  if (error) throw error
  return (data?.[0] as LinhaCredenciais | undefined) ?? null
}

function completas(linha: LinhaCredenciais | null): CredenciaisMeta | null {
  if (!linha?.token || !linha.phone_number_id || !linha.waba_id || !linha.app_id) return null
  return { appId: linha.app_id, phoneNumberId: linha.phone_number_id, wabaId: linha.waba_id, token: linha.token }
}

const NAO_CONECTADO = 'O WhatsApp oficial não está conectado. Cole o token e os IDs em Configurações › WhatsApp oficial.'

// Conexão ---------------------------------------------------------------------------------

function problemaDoNumero(n: NumeroMeta): string | null {
  if (n.platform_type && n.platform_type !== 'CLOUD_API') {
    return 'O número ainda não está registrado na API. Informe o PIN de 6 dígitos da confirmação em duas etapas e salve de novo.'
  }
  if (n.status === 'DISCONNECTED') return 'O número está desconectado da API. Informe o PIN de 6 dígitos e salve de novo para registrar.'
  if (n.status === 'FLAGGED' || n.status === 'RESTRICTED') return 'A Meta restringiu o número por baixa qualidade. Confira no Gerenciador do WhatsApp.'
  return null
}

function erroDaConexao(erro: unknown): string {
  if (!(erro instanceof ErroMeta)) return 'Não foi possível conferir a conexão na Meta.'
  if (erro.codigo === 100 || erro.codigo === 803) return 'A Meta não encontrou o número ou a conta com esses IDs — confira se copiou certo.'
  return mensagemDoErro(erro.codigo, erro.message)
}

async function salvarNumero(supabase: Admin, n: NumeroMeta, problema: string | null) {
  await supabase
    .from('whatsapp_oficial')
    .update({
      numero: n.display_phone_number ?? null,
      nome_verificado: n.verified_name ?? null,
      qualidade: n.quality_rating ?? null,
      limite_tier: faixaDoLimite(n.whatsapp_business_manager_messaging_limit),
      status_nome: n.name_status ?? null,
      verificado_em: agora(),
      ultimo_erro: problema,
    })
    .eq('id', 1)
}

/** Confere token e IDs na Meta, registra o número (com PIN) e liga o webhook do app à conta. */
export async function verificarConexao(supabase: Admin, pin: string | null): Promise<RespostaRotina> {
  const cred = completas(await lerCredenciais(supabase))
  if (!cred) return { ok: false, mensagem: NAO_CONECTADO }
  try {
    if (pin) await registrarNumero(cred, pin)
    const numero = await lerNumero(cred)
    await inscreverApp(cred)
    const problema = problemaDoNumero(numero)
    await salvarNumero(supabase, numero, problema)
    if (problema) return { ok: false, mensagem: problema }
    return { ok: true, mensagem: `Conexão conferida: ${numero.display_phone_number ?? 'número'} · ${numero.verified_name ?? 'sem nome'}.` }
  } catch (erro) {
    const mensagem = erroDaConexao(erro)
    await supabase.from('whatsapp_oficial').update({ ultimo_erro: mensagem, verificado_em: agora() }).eq('id', 1)
    return { ok: false, mensagem }
  }
}

/** Atualiza qualidade e limite a cada 30 min. Devolve a faixa de limite atual. */
async function conferirNumeroSePreciso(supabase: Admin, cred: CredenciaisMeta): Promise<string | null> {
  const { data } = await supabase.from('whatsapp_oficial').select('verificado_em, limite_tier').eq('id', 1).maybeSingle()
  const recente = data?.verificado_em && Date.now() - new Date(data.verificado_em).getTime() < CONFERIR_NUMERO_A_CADA_MS
  if (recente) return data.limite_tier
  try {
    const numero = await lerNumero(cred)
    await salvarNumero(supabase, numero, problemaDoNumero(numero))
    return faixaDoLimite(numero.whatsapp_business_manager_messaging_limit)
  } catch (erro) {
    await supabase.from('whatsapp_oficial').update({ ultimo_erro: erroDaConexao(erro), verificado_em: agora() }).eq('id', 1)
    return data?.limite_tier ?? null
  }
}

// Modelos (análise da Meta) -----------------------------------------------------------------

const SUBCODIGOS_CRIACAO: Record<number, string> = {
  2388299: 'A mensagem não pode começar nem terminar com {nome}.',
  2388293: 'Há variáveis demais para o tamanho do texto. Escreva um pouco mais em volta do {nome}.',
  2388040: 'Algum campo passou do limite de caracteres da Meta.',
  2388047: 'Formato da foto não aceito pela Meta.',
  2388072: 'Formato do texto não aceito pela Meta.',
  2388073: 'Formato do rodapé não aceito pela Meta.',
  2388019: 'A conta chegou ao limite de mensagens (modelos) cadastradas na Meta.',
}

function erroDaCriacao(erro: unknown): string {
  if (!(erro instanceof ErroMeta)) return 'Não foi possível enviar a mensagem para a Meta.'
  if (erro.subcodigo && SUBCODIGOS_CRIACAO[erro.subcodigo]) return SUBCODIGOS_CRIACAO[erro.subcodigo]
  return erro.codigo === 100 ? `A Meta recusou a mensagem: ${erro.message}` : mensagemDoErro(erro.codigo, erro.message)
}

/**
 * Aplica o status do modelo (pela consulta ou pelo webhook) a todas as campanhas que o usam.
 * Devolve true se alguma campanha ficou liberada para envio agora.
 */
export async function aplicarStatusModelo(
  supabase: Admin,
  modeloId: string,
  status: string,
  categoria?: string | null,
  motivo?: string | null,
): Promise<boolean> {
  conferir(
    await supabase
      .from('campanhas')
      .update({
        modelo_status: status,
        ...(categoria && { modelo_categoria: categoria }),
        modelo_motivo: motivo && motivo !== 'NONE' ? motivo : null,
      })
      .eq('modelo_id', modeloId),
  )

  if (status === 'APPROVED') {
    conferir(
      await supabase
        .from('campanhas')
        .update({ status: 'agendada' })
        .eq('modelo_id', modeloId)
        .eq('status', 'aguardando_aprovacao')
        .gt('agendada_para', agora()),
    )
    const { data } = conferir(
      await supabase
        .from('campanhas')
        .update({ status: 'enviando', iniciada_em: agora() })
        .eq('modelo_id', modeloId)
        .eq('status', 'aguardando_aprovacao')
        .select('id'),
    )
    return data.length > 0
  }
  if (status === 'REJECTED') {
    conferir(
      await supabase
        .from('campanhas')
        .update({ status: 'recusada', ultimo_erro: motivoDaRecusa(motivo) })
        .eq('modelo_id', modeloId)
        .eq('status', 'aguardando_aprovacao'),
    )
  }
  if (status === 'PAUSED' || status === 'DISABLED') {
    conferir(
      await supabase
        .from('campanhas')
        .update({
          status: 'pausada',
          pausada_motivo: 'modelo',
          ultimo_erro:
            status === 'PAUSED'
              ? 'A Meta pausou esta mensagem por baixa qualidade (muitos bloqueios ou denúncias). Ela volta sozinha depois de algumas horas; revise a lista antes de retomar.'
              : 'A Meta desativou esta mensagem. Crie uma campanha com outro texto.',
        })
        .eq('modelo_id', modeloId)
        .in('status', ['enviando', 'agendada', 'aguardando_aprovacao']),
    )
  }
  return false
}

/** Manda a mensagem da campanha para a análise — ou reaproveita um modelo igual já aprovado. */
export async function analisarCampanha(supabase: Admin, campanhaId: string): Promise<RespostaRotina> {
  const { data: c } = await supabase.from('campanhas').select('*').eq('id', campanhaId).maybeSingle()
  if (!c) return { ok: false, mensagem: 'Campanha não encontrada.' }
  if (c.status !== 'aguardando_aprovacao' || c.modelo_id) return { ok: true, mensagem: 'A mensagem já está com a Meta.' }

  const falhar = async (mensagem: string): Promise<RespostaRotina> => {
    await supabase.from('campanhas').update({ status: 'falhou', ultimo_erro: mensagem }).eq('id', c.id).eq('status', 'aguardando_aprovacao')
    return { ok: false, mensagem }
  }

  const cred = completas(await lerCredenciais(supabase))
  if (!cred) return falhar(NAO_CONECTADO)

  const assinatura = assinaturaDoModelo(c)
  try {
    const { data: igual } = await supabase
      .from('campanhas')
      .select('modelo_nome, modelo_id, modelo_categoria')
      .eq('modelo_assinatura', assinatura)
      .eq('modelo_status', 'APPROVED')
      .neq('id', c.id)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (igual?.modelo_id) {
      await supabase
        .from('campanhas')
        .update({ modelo_nome: igual.modelo_nome, modelo_id: igual.modelo_id, modelo_categoria: igual.modelo_categoria, modelo_status: 'APPROVED', modelo_assinatura: assinatura })
        .eq('id', c.id)
      await aplicarStatusModelo(supabase, igual.modelo_id, 'APPROVED')
      return { ok: true, mensagem: 'Esta mensagem já foi aprovada pela Meta antes — a campanha segue sem nova análise.' }
    }

    const nome = nomeDoModelo(c)
    let handle: string | null = null
    if (c.imagem_path) {
      const { data: foto, error } = await supabase.storage.from('campanhas').download(c.imagem_path)
      if (error || !foto) return falhar('Não foi possível ler a foto da campanha. Crie a campanha de novo.')
      handle = await enviarExemploImagem(cred, foto, c.imagem_path)
    }

    let modelo: ModeloMeta
    try {
      modelo = await criarModelo(cred, corpoDoModelo(c, nome, handle))
    } catch (erro) {
      // Já criado numa tentativa anterior: usa o que está na Meta.
      const existente = erro instanceof ErroMeta && erro.subcodigo === 2388024 ? await buscarModeloPorNome(cred, nome) : null
      if (!existente) throw erro
      modelo = existente
    }

    await supabase
      .from('campanhas')
      .update({
        modelo_nome: nome,
        modelo_id: modelo.id,
        modelo_status: modelo.status,
        modelo_categoria: modelo.category ?? 'MARKETING',
        modelo_assinatura: assinatura,
      })
      .eq('id', c.id)
    if (modelo.status !== 'PENDING') await aplicarStatusModelo(supabase, modelo.id, modelo.status, modelo.category, modelo.rejected_reason)

    return {
      ok: modelo.status !== 'REJECTED',
      mensagem:
        modelo.status === 'APPROVED'
          ? 'A Meta aprovou a mensagem na hora.'
          : modelo.status === 'REJECTED'
            ? `A Meta recusou a mensagem. ${motivoDaRecusa(modelo.rejected_reason)}`
            : 'Mensagem enviada para a análise da Meta. O envio começa sozinho quando ela aprovar.',
    }
  } catch (erro) {
    console.error('[campanhas] falha ao criar o modelo', erro)
    return falhar(erroDaCriacao(erro))
  }
}

/** Confere os modelos ainda em análise (garantia para quando o webhook não avisar). */
async function conferirModelosPendentes(supabase: Admin, cred: CredenciaisMeta) {
  const { data } = await supabase
    .from('campanhas')
    .select('modelo_id')
    .eq('status', 'aguardando_aprovacao')
    .not('modelo_id', 'is', null)
    .order('atualizado_em')
    .limit(20)
  for (const id of new Set((data ?? []).map((c) => c.modelo_id as string))) {
    try {
      const modelo = await lerModelo(cred, id)
      if (modelo.status !== 'PENDING') await aplicarStatusModelo(supabase, id, modelo.status, modelo.category, modelo.rejected_reason)
    } catch (erro) {
      console.error('[campanhas] não foi possível consultar o modelo', id, erro)
    }
  }
}

// Envio -----------------------------------------------------------------------------------------

type EnvioReservado = { id: number; whatsapp: string; nome: string | null; tentativas: number }
/** ok | falha só do contato | falha passageira | problema da conta | sem resposta da Meta (pode ter saído). */
type ResultadoEnvio = { tipo: 'ok' } | { tipo: ClasseErro | 'incerto'; codigo: number | null; mensagem: string }

/** Erros do Supabase viram exceção (o supabase-js devolve { error } em vez de lançar). */
export function conferir<R extends { error: unknown; data?: unknown }>(resposta: R): R & { data: NonNullable<R['data']> } {
  if (resposta.error) throw resposta.error
  return resposta as R & { data: NonNullable<R['data']> }
}

/** Espera antes da próxima tentativa: 2, 4, 8, 16 min. */
const esperaDaTentativa = (tentativas: number) => new Date(Date.now() + 2 ** Math.min(tentativas, 4) * 60_000).toISOString()

/** Pausa a campanha por um problema da conta, do número ou da mensagem (a equipe retoma depois de resolver). */
export async function pausarPorErro(supabase: Admin, campanhaId: string, mensagem: string) {
  conferir(
    await supabase
      .from('campanhas')
      .update({ status: 'pausada', pausada_motivo: 'erro', ultimo_erro: mensagem })
      .eq('id', campanhaId)
      .eq('status', 'enviando'),
  )
}

async function enviarUm(supabase: Admin, cred: CredenciaisMeta, c: Campanha, envio: EnvioReservado): Promise<ResultadoEnvio> {
  const modelo: ModeloParaEnvio = {
    name: c.modelo_nome as string,
    language: { code: IDIOMA_MODELO },
    components: componentesDoEnvio(c, envio.nome, urlImagemCampanha(c.imagem_path)),
  }
  try {
    const r = await enviarModelo(cred, envio.whatsapp, modelo)
    // A mensagem já saiu: insiste em gravar (se ficar "enviando", ela nunca é reenviada, só marcada como incerta).
    for (let tentativa = 1; ; tentativa++) {
      const { error } = await supabase
        .from('campanha_envios')
        .update({ status: 'enviada', wamid: r.wamid, wa_id: r.waId, enviada_em: agora(), reservado_em: null, erro: null, erro_codigo: null })
        .eq('id', envio.id)
      if (!error) break
      if (tentativa === 3) throw error
    }
    return { tipo: 'ok' }
  } catch (erro) {
    if (!(erro instanceof ErroMeta)) throw erro
    const codigo = erro.codigo
    const mensagem = erro.semResposta ? 'Sem resposta da Meta — a mensagem pode ou não ter chegado.' : mensagemDoErro(codigo, erro.message)
    const tipo = erro.semResposta ? 'incerto' : classeDoErro(codigo)
    // Passageiro ou da conta: volta para a fila (até MAX_TENTATIVAS). Do contato ou incerto: não reenvia.
    const volta = (tipo === 'repetir' || tipo === 'conta') && envio.tentativas < MAX_TENTATIVAS
    conferir(
      await supabase
        .from('campanha_envios')
        .update({
          status: volta ? 'pendente' : 'falhou',
          proxima_tentativa_em: volta && tipo === 'repetir' ? esperaDaTentativa(envio.tentativas) : null,
          reservado_em: null,
          erro: mensagem,
          erro_codigo: codigo,
        })
        .eq('id', envio.id),
    )
    if (codigo === ERRO_SAIU_DO_MARKETING) {
      conferir(
        await supabase
          .from('whatsapp_descadastros')
          .upsert({ whatsapp: envio.whatsapp, origem: 'meta', campanha_id: c.id }, { onConflict: 'whatsapp', ignoreDuplicates: true }),
      )
    }
    return { tipo, codigo, mensagem }
  }
}

async function emParalelo<T>(itens: T[], simultaneos: number, tarefa: (item: T) => Promise<void>) {
  let proximo = 0
  await Promise.all(
    Array.from({ length: Math.min(simultaneos, itens.length) }, async () => {
      while (proximo < itens.length) await tarefa(itens[proximo++])
    }),
  )
}

type FimDaCampanha = 'fim' | 'tempo' | 'limite' | 'instavel' | 'conta' | 'parada'

async function enviarCampanha(
  supabase: Admin,
  cred: CredenciaisMeta,
  c: Campanha,
  limite: number | null,
  inicio: number,
): Promise<{ enviados: number; fim: FimDaCampanha }> {
  let enviados = 0
  while (Date.now() - inicio < PRAZO_MS) {
    // A equipe pode ter pausado ou cancelado no meio da rodada.
    const { data: atual } = conferir(await supabase.from('campanhas').select('status, pausada_motivo').eq('id', c.id).single())
    if (atual.status !== 'enviando') return { enviados, fim: 'parada' }

    let tamanho = LOTE
    if (limite !== null) {
      const { data: usados } = conferir(await supabase.rpc('contatos_campanha_24h'))
      tamanho = Math.min(LOTE, limite - usados)
      if (tamanho <= 0) {
        if (atual.pausada_motivo !== 'limite') {
          conferir(await supabase.from('campanhas').update({ pausada_motivo: 'limite' }).eq('id', c.id).eq('status', 'enviando'))
        }
        return { enviados, fim: 'limite' }
      }
    }
    if (atual.pausada_motivo === 'limite') {
      conferir(await supabase.from('campanhas').update({ pausada_motivo: null }).eq('id', c.id).eq('status', 'enviando'))
    }

    const { data: lote } = conferir(await supabase.rpc('reservar_envios_campanha', { p_campanha_id: c.id, p_limite: tamanho }))
    if (lote.length === 0) {
      const { count } = conferir(
        await supabase
          .from('campanha_envios')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', c.id)
          .in('status', ['pendente', 'enviando']),
      )
      if (!count) {
        conferir(
          await supabase.from('campanhas').update({ status: 'concluida', concluida_em: agora(), pausada_motivo: null }).eq('id', c.id).eq('status', 'enviando'),
        )
      }
      // Sobrou alguém esperando nova tentativa: a próxima rodada continua.
      return { enviados, fim: 'fim' }
    }

    // Problema da conta, limite de velocidade ou Meta sem responder interrompem o lote: o resto volta para a fila.
    const rodada: { parar: { fim: 'conta' | 'instavel'; mensagem: string } | null; enviadosNoLote: number; passageiros: number } = {
      parar: null,
      enviadosNoLote: 0,
      passageiros: 0,
    }
    await emParalelo(lote, SIMULTANEOS, async (envio) => {
      if (rodada.parar) {
        // Nem foi tentado: devolve sem gastar tentativa.
        conferir(
          await supabase
            .from('campanha_envios')
            .update({ status: 'pendente', reservado_em: null, tentativas: Math.max(envio.tentativas - 1, 0) })
            .eq('id', envio.id),
        )
        return
      }
      const r = await enviarUm(supabase, cred, c, envio)
      if (r.tipo === 'ok') rodada.enviadosNoLote++
      else if (r.tipo === 'conta') rodada.parar ??= { fim: 'conta', mensagem: r.mensagem }
      else if (r.tipo === 'incerto' || r.codigo === 130429 || r.codigo === 80007 || r.codigo === 4) rodada.parar ??= { fim: 'instavel', mensagem: r.mensagem }
      else if (r.tipo === 'repetir') rodada.passageiros++
    })
    enviados += rodada.enviadosNoLote

    if (rodada.parar?.fim === 'conta') {
      await pausarPorErro(supabase, c.id, rodada.parar.mensagem)
      return { enviados, fim: 'conta' }
    }
    // Meta instável (lote inteiro com falha passageira): para a rodada em vez de gastar as tentativas da lista.
    if (rodada.parar || (rodada.enviadosNoLote === 0 && rodada.passageiros > 0)) return { enviados, fim: 'instavel' }
  }
  return { enviados, fim: 'tempo' }
}

export type ResumoRodada = { ok: boolean; mensagem: string; enviados: number }

/** Uma rodada da rotina: modelos em análise → agendadas → envio da fila. */
export async function processarCampanhas(supabase: Admin): Promise<ResumoRodada> {
  const cred = completas(await lerCredenciais(supabase))
  if (!cred) return { ok: false, mensagem: NAO_CONECTADO, enviados: 0 }
  const inicio = Date.now()

  await conferirModelosPendentes(supabase, cred)
  // Confirmadas cuja ida para a Meta não aconteceu (ex.: queda no meio do pedido da tela).
  const doisMinutosAtras = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: semModelo } = await supabase
    .from('campanhas')
    .select('id')
    .eq('status', 'aguardando_aprovacao')
    .is('modelo_id', null)
    .lt('atualizado_em', doisMinutosAtras)
    .limit(5)
  for (const c of semModelo ?? []) await analisarCampanha(supabase, c.id)
  await supabase.from('campanhas').update({ status: 'enviando', iniciada_em: agora() }).eq('status', 'agendada').lte('agendada_para', agora())
  const limite = limiteDiario(await conferirNumeroSePreciso(supabase, cred))

  const { data: campanhas, error } = await supabase
    .from('campanhas')
    .select('*')
    .eq('status', 'enviando')
    .order('iniciada_em', { ascending: true, nullsFirst: true })
  if (error) throw error

  let enviados = 0
  for (const c of campanhas) {
    if (Date.now() - inicio >= PRAZO_MS) break
    const { data: travada } = await supabase.rpc('travar_campanha', { p_campanha_id: c.id })
    if (!travada) continue
    try {
      const r = await enviarCampanha(supabase, cred, c, limite, inicio)
      enviados += r.enviados
      // Limite diário e instabilidade valem para o número inteiro: as próximas campanhas esperam também.
      if (r.fim === 'limite' || r.fim === 'instavel') break
    } finally {
      await supabase.from('campanhas').update({ processando_desde: null }).eq('id', c.id)
    }
  }
  return { ok: true, mensagem: `${enviados} mensagem(ns) enviada(s) nesta rodada.`, enviados }
}

/** Envia a mensagem (já aprovada) da campanha para um número de teste. Não entra nos números da campanha. */
export async function enviarTeste(supabase: Admin, campanhaId: string, numero: string, nome: string): Promise<RespostaRotina> {
  const cred = completas(await lerCredenciais(supabase))
  if (!cred) return { ok: false, mensagem: NAO_CONECTADO }
  const { data: c } = await supabase.from('campanhas').select('*').eq('id', campanhaId).maybeSingle()
  if (!c) return { ok: false, mensagem: 'Campanha não encontrada.' }
  if (c.modelo_status !== 'APPROVED' || !c.modelo_nome) return { ok: false, mensagem: 'O teste fica disponível depois que a Meta aprovar a mensagem.' }
  try {
    await enviarModelo(cred, numero, {
      name: c.modelo_nome,
      language: { code: IDIOMA_MODELO },
      components: componentesDoEnvio(c, nome, urlImagemCampanha(c.imagem_path)),
    })
    return { ok: true, mensagem: `Teste enviado para ${formatarWhatsapp(numero)}.` }
  } catch (erro) {
    return { ok: false, mensagem: mensagemDoErro(erro instanceof ErroMeta ? erro.codigo : null, erro instanceof Error ? erro.message : null) }
  }
}
