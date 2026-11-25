'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { entregarEventoAgora, type EntregaEvento } from '@/features/integracoes/eventos'
import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { hojeISO, somarDias } from '@/lib/datas'
import { urlDoSite } from '@/lib/url'
import { formParaObjeto } from '@/lib/validacao'
import type { Json } from '@/types'

import { diasParaVencer, eventoDaTratativa, eventoDoAviso, type DadosDoAviso } from './avisos'

type Supabase = Awaited<ReturnType<typeof exigirEquipe>>['supabase']

function atualizarTelas() {
  revalidatePath('/lotes', 'layout')
}

/** Frase para a tela sobre a entrega do evento ao n8n. */
function resultadoDaEntrega(entrega: EntregaEvento, oQue: string): EstadoAcao {
  if (entrega.status === 'enviado') return sucesso(`${oQue} entregue ao n8n. Deve aparecer no grupo em instantes.`)
  if (entrega.status === 'sem_destino') {
    return falha('Nenhum webhook ativo recebe os avisos de validade. Confira em Configurações › Webhooks o "n8n · validade dos lotes".')
  }
  return falha(
    `O n8n não recebeu (${entrega.erro ?? 'sem resposta'}). Confira se o fluxo "Cerveja Lenta - Aviso de Venda (grupo equipe)" está publicado no n8n. ` +
      'O CRM tenta de novo sozinho daqui a pouco.',
  )
}

async function enfileirarEEntregar(
  supabase: Supabase,
  tipo: 'lote.alerta_validade' | 'lote.tratativa_registrada',
  alertaId: string,
  tratativaId: string | null,
  payload: Json,
): Promise<EntregaEvento | { status: 'erro_fila'; erro: string }> {
  const { data: eventoId, error } = await supabase.rpc('enfileirar_aviso_lote', {
    p_tipo: tipo,
    p_alerta_id: alertaId,
    p_tratativa_id: tratativaId,
    p_payload: payload,
  })
  if (error || !eventoId) return { status: 'erro_fila', erro: error ? traduzirErro(error) : 'Não foi possível pôr o aviso na fila.' }
  return entregarEventoAgora(eventoId)
}

/**
 * Botão de teste: manda ao grupo (pelo n8n) um aviso de verdade marcado como TESTE, usando o
 * lote que vence primeiro (ou um exemplo, se ainda não houver lote). O link da mensagem abre a
 * tratativa desse teste, para testar o fluxo inteiro.
 */
export async function testarAvisoNoGrupo(): Promise<EstadoAcao> {
  const { supabase, perfil } = await exigirEquipe()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, lote, validade, quantidade, cerveja_id, lotes_cervejas(nome, sku, olist_id)')
    .or('quantidade.is.null,quantidade.gt.0')
    .order('validade')
    .limit(1)
    .maybeSingle()

  const exemplo = {
    lote_id: lote?.id ?? null,
    cerveja_id: lote?.cerveja_id ?? null,
    olist_id: lote?.lotes_cervejas?.olist_id ?? null,
    cerveja_nome: lote?.lotes_cervejas?.nome ?? 'Cerveja de exemplo',
    sku: lote?.lotes_cervejas?.sku ?? null,
    lote: lote?.lote ?? 'TESTE-001',
    validade: lote?.validade ?? somarDias(hojeISO(), 5),
    quantidade: lote ? lote.quantidade : 12,
  }
  const dias = diasParaVencer(exemplo.validade)
  const faixa = dias <= 7 ? 'critico' : dias <= 15 ? 'atencao' : 'alerta'

  const { data: aviso, error } = await supabase
    .from('lote_alertas')
    .insert({ ...exemplo, faixa, dias, teste: true, criado_por: perfil.id })
    .select('id, cerveja_nome, lote, validade, quantidade, faixa, teste')
    .single()
  if (error) return falha(traduzirErro(error))

  const entrega = await enfileirarEEntregar(supabase, 'lote.alerta_validade', aviso.id, null, eventoDoAviso(aviso, await urlDoSite()))
  atualizarTelas()
  if (entrega.status === 'erro_fila') return falha(entrega.erro)
  return resultadoDaEntrega(entrega, 'Mensagem de teste')
}

const esquemaTratativa = z.object({
  texto: z
    .string({ error: 'Conte o que foi feito.' })
    .trim()
    .min(3, 'Conte o que foi feito para não perder a cerveja.')
    .max(2000, 'Use no máximo 2.000 caracteres.'),
})

/** Registra quem tratou, quando e o que fez — e confirma no grupo (pelo n8n). */
export async function registrarTratativa(alertaId: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase, perfil } = await exigirEquipe()
  const dados = esquemaTratativa.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { data: aviso } = await supabase
    .from('lote_alertas')
    .select('id, cerveja_nome, lote, validade, quantidade, faixa, teste')
    .eq('id', alertaId)
    .maybeSingle()
  if (!aviso) return falha('Aviso não encontrado.')

  const { data: tratativa, error } = await supabase
    .from('lote_tratativas')
    .insert({ alerta_id: alertaId, autor_id: perfil.id, texto: dados.data.texto })
    .select('id, texto, criado_em')
    .single()
  if (error) return falha(traduzirErro(error))
  atualizarTelas()

  const autor = perfil.nome?.trim() || perfil.email || 'Equipe'
  const entrega = await enfileirarEEntregar(
    supabase,
    'lote.tratativa_registrada',
    alertaId,
    tratativa.id,
    eventoDaTratativa(aviso as DadosDoAviso, { autor, texto: tratativa.texto, criado_em: tratativa.criado_em }),
  )
  if (entrega.status === 'enviado') return sucesso('Tratativa registrada e avisada no grupo.')
  if (entrega.status === 'erro_fila') return sucesso(`Tratativa registrada. O aviso no grupo não saiu: ${entrega.erro}`)
  return sucesso(
    entrega.status === 'sem_destino'
      ? 'Tratativa registrada. O aviso no grupo não saiu: nenhum webhook ativo recebe os avisos de validade.'
      : 'Tratativa registrada. O n8n não respondeu agora; o CRM tenta avisar o grupo de novo sozinho.',
  )
}

/** Manda de novo ao grupo um aviso cuja entrega falhou. */
export async function reenviarAviso(alertaId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: aviso } = await supabase
    .from('lote_alertas')
    .select('id, cerveja_nome, lote, validade, quantidade, faixa, teste')
    .eq('id', alertaId)
    .maybeSingle()
  if (!aviso) return falha('Aviso não encontrado.')
  const entrega = await enfileirarEEntregar(supabase, 'lote.alerta_validade', aviso.id, null, eventoDoAviso(aviso, await urlDoSite()))
  atualizarTelas()
  if (entrega.status === 'erro_fila') return falha(entrega.erro)
  return resultadoDaEntrega(entrega, aviso.teste ? 'Mensagem de teste' : 'Aviso')
}

/** Liga/desliga os avisos automáticos no grupo (só admin). */
export async function alternarAvisosNoGrupo(ativo: boolean): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.from('configuracoes').update({ lotes_aviso_grupo: ativo }).eq('id', 1)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso(ativo ? 'Avisos no grupo ligados.' : 'Avisos no grupo pausados. O botão de teste continua funcionando.')
}
