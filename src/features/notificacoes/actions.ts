'use server'

import { revalidatePath } from 'next/cache'

import { falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { uuid } from '@/lib/validacao'

/** Marca como lidos os avisos do membro logado — todos ou só os de uma tarefa. */
export async function marcarAvisosLidos(tarefaId?: string): Promise<EstadoAcao> {
  const { supabase, perfil } = await exigirEquipe()
  if (tarefaId && !uuid.safeParse(tarefaId).success) return falha('Tarefa inválida.')

  let consulta = supabase
    .from('notificacoes')
    .update({ lida_em: new Date().toISOString() })
    .eq('perfil_id', perfil.id)
    .is('lida_em', null)
  if (tarefaId) consulta = consulta.eq('tarefa_id', tarefaId)

  const { error } = await consulta
  if (error) return falha(traduzirErro(error))
  revalidatePath('/', 'layout')
  return sucesso()
}
