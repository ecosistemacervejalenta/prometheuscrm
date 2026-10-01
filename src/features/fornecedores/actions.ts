'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formParaObjeto } from '@/lib/validacao'

import { esquemaFornecedor, esquemaVendedor } from './schema'

export async function salvarFornecedor(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaFornecedor.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = id
    ? await supabase.from('fornecedores').update(dados.data).eq('id', id)
    : await supabase.from('fornecedores').insert(dados.data)
  if (error) return falha(traduzirErro(error))

  revalidatePath('/fornecedores')
  redirect('/fornecedores')
}

export async function excluirFornecedor(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('fornecedores').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/fornecedores')
  redirect('/fornecedores')
}

export async function salvarVendedor(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaVendedor.safeParse(formParaObjeto(formData, ['fornecedor_ids']))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { fornecedor_ids, novas_empresas, ...vendedor } = dados.data

  const { data, error } = id
    ? await supabase.from('vendedores').update(vendedor).eq('id', id).select('id').single()
    : await supabase.from('vendedores').insert(vendedor).select('id').single()
  if (error) return falha(traduzirErro(error))

  const vinculo = await supabase.rpc('definir_empresas_do_vendedor', {
    p_vendedor_id: data.id,
    p_fornecedor_ids: fornecedor_ids,
    p_novas_empresas: novas_empresas,
  })
  if (vinculo.error) return falha(traduzirErro(vinculo.error))

  revalidatePath('/fornecedores', 'layout')
  redirect('/fornecedores/vendedores')
}

export async function excluirVendedor(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('vendedores').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/fornecedores', 'layout')
  redirect('/fornecedores/vendedores')
}
