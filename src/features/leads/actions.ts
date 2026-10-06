'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formParaObjeto } from '@/lib/validacao'

import {
  esquemaEdicaoLista,
  esquemaExportacao,
  esquemaLote,
  esquemaNovaLista,
  esquemaPasta,
  NUMEROS_POR_PAGINA,
  type LinhaExportacao,
} from './schema'

export type ResultadoImportacao = { ok: true; listaId: string; inseridos?: number } | { ok: false; mensagem: string }

function atualizarTelas() {
  revalidatePath('/leads', 'layout')
}

export async function salvarPasta(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaPasta.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { data, error } = id
    ? await supabase.from('leads_pastas').update(dados.data).eq('id', id).select('id').single()
    : await supabase.from('leads_pastas').insert(dados.data).select('id').single()
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  redirect(`/leads/pastas/${data.id}`)
}

export async function excluirPasta(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { count } = await supabase.from('leads_listas').select('id', { count: 'exact', head: true }).eq('pasta_id', id)
  if (count) return falha(`Esta pasta tem ${count} lista(s). Exclua ou mova as listas antes de excluir a pasta.`)
  const { error } = await supabase.from('leads_pastas').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  redirect('/leads')
}

/** 1º passo da importação: cria a pasta (se nova) e a lista, ainda "importando". */
export async function iniciarImportacao(entrada: unknown): Promise<ResultadoImportacao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaNovaLista.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? 'Dados inválidos.' }

  const { nova_pasta, pasta_id, ...lista } = dados.data
  let pastaId = pasta_id
  if (!pastaId && nova_pasta) {
    const { data, error } = await supabase.from('leads_pastas').insert({ nome: nova_pasta }).select('id').single()
    if (error) return { ok: false, mensagem: traduzirErro(error) }
    pastaId = data.id
  }

  const { data, error } = await supabase
    .from('leads_listas')
    .insert({ ...lista, pasta_id: pastaId! })
    .select('id')
    .single()
  if (error) return { ok: false, mensagem: traduzirErro(error) }
  return { ok: true, listaId: data.id }
}

/** 2º passo: envia um lote (até 2.000). Reenviar o mesmo lote não duplica nada. */
export async function importarLote(listaId: string, entrada: unknown): Promise<ResultadoImportacao> {
  const { supabase } = await exigirEquipe()
  const lote = esquemaLote.safeParse(entrada)
  if (!lote.success) return { ok: false, mensagem: 'Lote inválido. Recarregue a página e tente de novo.' }

  const { data, error } = await supabase.rpc('importar_leads', { p_lista_id: listaId, p_leads: lote.data })
  if (error) return { ok: false, mensagem: traduzirErro(error) }
  return { ok: true, listaId, inseridos: data ?? 0 }
}

/** 3º passo: recalcula os totais e marca a lista como pronta. */
export async function concluirImportacao(listaId: string): Promise<ResultadoImportacao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('concluir_importacao_leads', { p_lista_id: listaId })
  if (error) return { ok: false, mensagem: traduzirErro(error) }
  atualizarTelas()
  return { ok: true, listaId }
}

/**
 * Uma página dos números a exportar (sem repetir, em ordem de número). O navegador
 * pede página por página, passando em `apos` o último número recebido, e monta o arquivo.
 */
export async function buscarNumerosParaExportar(
  entrada: unknown,
): Promise<{ ok: true; linhas: LinhaExportacao[] } | { ok: false; mensagem: string }> {
  const { supabase } = await exigirEquipe()
  const filtro = esquemaExportacao.safeParse(entrada)
  if (!filtro.success) return { ok: false, mensagem: 'Filtro inválido. Recarregue a página e tente de novo.' }

  const { pasta_id, lista_id, ddd, apos } = filtro.data
  const { data, error } = await supabase.rpc('exportar_numeros_leads', {
    p_pasta_id: pasta_id ?? undefined,
    p_lista_id: lista_id ?? undefined,
    p_ddd: ddd ?? undefined,
    p_apos: apos ?? undefined,
    p_limite: NUMEROS_POR_PAGINA,
  })
  if (error) return { ok: false, mensagem: traduzirErro(error) }
  return { ok: true, linhas: data as LinhaExportacao[] }
}

export async function salvarLista(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaEdicaoLista.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.from('leads_listas').update(dados.data).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  redirect(`/leads/listas/${id}`)
}

export async function excluirLista(id: string, pastaId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('leads_listas').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  redirect(`/leads/pastas/${pastaId}`)
}

/** Recalcula os totais de uma lista que ficou "importando" (ex.: aba fechada no meio). */
export async function finalizarListaIncompleta(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('concluir_importacao_leads', { p_lista_id: id })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Lista finalizada com os leads que chegaram a ser importados.')
}
