'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formParaObjeto } from '@/lib/validacao'

import { agendarProcessamentoDeEventos } from '../integracoes/eventos'
import { buscarClientesRapido } from './queries'
import { esquemaCliente } from './schema'

export async function salvarCliente(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()

  const dados = esquemaCliente.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const consulta = id
    ? supabase.from('clientes').update(dados.data).eq('id', id).select('id').single()
    : supabase.from('clientes').insert({ ...dados.data, origem: 'manual' }).select('id').single()

  const { data, error } = await consulta
  if (error) return falha(traduzirErro(error))

  agendarProcessamentoDeEventos()
  revalidatePath('/clientes')
  redirect(`/clientes/${data.id}`)
}

export async function excluirCliente(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) {
    return falha(
      error.code === '23503' ? 'Este cliente tem pedidos e não pode ser excluído.' : traduzirErro(error),
    )
  }
  revalidatePath('/clientes')
  redirect('/clientes')
}

export async function buscarClientes(texto: string) {
  return buscarClientesRapido(texto)
}
