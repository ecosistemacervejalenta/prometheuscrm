'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { gerarParcelas } from '@/features/financeiro/regras'
import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { hojeISO } from '@/lib/datas'
import { formParaObjeto } from '@/lib/validacao'

import { esquemaContaReceber, esquemaEdicaoContaReceber } from './schema'

function atualizarTelas() {
  revalidatePath('/receber', 'layout')
  revalidatePath('/')
}

/** Lança uma conta a receber — ou várias, se parcelada (uma por mês). */
export async function criarContaReceber(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaContaReceber.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { parcelas, modo_valor, ja_recebida, vencimento, descricao, valor, ...resto } = dados.data
  const linhas = gerarParcelas({ descricao, valor, modo: modo_valor, parcelas, vencimento }).map((parcela, i) => ({
    ...resto,
    ...parcela,
    ...(ja_recebida && i === 0 ? { status: 'recebida' as const, recebido_em: hojeISO() } : { status: 'pendente' as const }),
  }))

  const { error } = await supabase.from('contas_receber').insert(linhas)
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  redirect(`/receber?mes=${vencimento.slice(0, 7)}`)
}

export async function atualizarContaReceber(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaEdicaoContaReceber.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase
    .from('contas_receber')
    .update({ ...dados.data, valor_recebido: dados.data.status === 'recebida' ? dados.data.valor : null })
    .eq('id', id)
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  redirect(`/receber?mes=${dados.data.vencimento.slice(0, 7)}`)
}

export async function receberConta(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('contas_receber').update({ status: 'recebida', recebido_em: hojeISO() }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Conta marcada como recebida.')
}

export async function reabrirContaReceber(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('contas_receber').update({ status: 'pendente' }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Conta reaberta.')
}

export async function excluirContaReceber(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('contas_receber').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Conta excluída.')
}
