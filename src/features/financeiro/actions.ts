'use server'

import { revalidatePath } from 'next/cache'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formParaObjeto } from '@/lib/validacao'

import { esquemaCategoria, esquemaRenomearCategoria } from './schema'

function atualizarTelas() {
  revalidatePath('/contas', 'layout')
  revalidatePath('/receber', 'layout')
}

export async function criarCategoria(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaCategoria.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.from('categorias_financeiras').insert(dados.data)
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  return sucesso(`Categoria “${dados.data.nome}” cadastrada.`)
}

/** Renomeia a categoria e as contas que a usam. */
export async function renomearCategoria(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaRenomearCategoria.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.rpc('renomear_categoria_financeira', { p_id: id, p_nome: dados.data.nome })
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  return sucesso('Categoria renomeada.')
}

/** Exclui a categoria; as contas que a usavam passam para "Outros". */
export async function excluirCategoria(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('excluir_categoria_financeira', { p_id: id })
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  return sucesso('Categoria excluída. As contas dela foram para “Outros”.')
}
