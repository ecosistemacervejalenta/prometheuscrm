'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { slugificar } from '@/lib/utils'
import type { StatusPreVenda } from '@/types'

import { agendarProcessamentoDeEventos } from '../integracoes/eventos'
import { esquemaPreVenda } from './schema'

function atualizarTelas() {
  revalidatePath('/pre-vendas', 'layout')
  revalidatePath('/grupo-vip')
  revalidatePath('/')
}

export async function salvarPreVenda(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaPreVenda.safeParse(Object.fromEntries(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { itens, ...preVenda } = dados.data
  // Link amigável: /p/drop-de-outubro-x7k2 (sufixo aleatório evita colisões).
  const slug = preVenda.slug ?? (id ? null : `${slugificar(preVenda.titulo) || 'pre-venda'}-${crypto.randomUUID().slice(0, 4)}`)

  const { data, error } = await supabase.rpc('salvar_pre_venda', {
    p_id: id ?? undefined,
    p_dados: { ...preVenda, slug },
    p_itens: itens,
  })
  if (error) return falha(traduzirErro(error))

  agendarProcessamentoDeEventos()
  atualizarTelas()
  redirect(`/pre-vendas/${data.id}`)
}

export async function alterarStatusPreVenda(id: string, status: StatusPreVenda): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const atualizacao = status === 'ativa' ? { status, encerra_em: null } : { status }
  const { error } = await supabase.from('pre_vendas').update(atualizacao).eq('id', id)
  if (error) return falha(traduzirErro(error))
  agendarProcessamentoDeEventos()
  atualizarTelas()
  return sucesso(status === 'encerrada' ? 'Pré-venda encerrada: o link não aceita mais pedidos.' : 'Pré-venda reaberta.')
}

export async function excluirPreVenda(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { count } = await supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('pre_venda_id', id)
  if ((count ?? 0) > 0) return falha('Esta pré-venda já tem pedidos. Encerre em vez de excluir.')

  const { error } = await supabase.from('pre_vendas').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  redirect('/pre-vendas')
}
