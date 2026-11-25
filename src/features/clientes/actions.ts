'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { formParaObjeto } from '@/lib/validacao'

import { BUCKET_MIDIAS } from '../atendimento/sincronizacao'
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

/**
 * Pedido de exclusão do titular (LGPD, art. 18): apaga os dados pessoais do cliente, as conversas
 * do Atendimento e o número no Banco de Leads e nas campanhas. Os pedidos continuam (valores e
 * itens, para o registro de vendas e o fiscal), só com cidade/UF. Só admin.
 */
export async function anonimizarCliente(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { data, error } = await supabase.rpc('anonimizar_cliente', { p_cliente_id: id })
  if (error) return falha(traduzirErro(error))

  // Fotos, áudios e arquivos das conversas apagadas.
  const midias = ((data ?? {}) as { midias?: unknown }).midias
  const caminhos = Array.isArray(midias) ? midias.filter((m): m is string => typeof m === 'string' && m.length > 0) : []
  if (caminhos.length > 0) {
    const storage = createAdminClient().storage.from(BUCKET_MIDIAS)
    for (let i = 0; i < caminhos.length; i += 100) {
      const { error: erroMidia } = await storage.remove(caminhos.slice(i, i + 100))
      if (erroMidia) console.error('[clientes] anonimizar: mídias do WhatsApp', erroMidia.message)
    }
  }

  agendarProcessamentoDeEventos()
  revalidatePath('/clientes')
  revalidatePath('/atendimento')
  redirect(`/clientes/${id}`)
}

export async function buscarClientes(texto: string) {
  return buscarClientesRapido(texto)
}
