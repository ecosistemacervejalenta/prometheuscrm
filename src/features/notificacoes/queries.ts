import 'server-only'

import { exigirEquipe } from '@/lib/auth'

export type Aviso = {
  id: string
  tipo: string
  titulo: string
  texto: string | null
  lido: boolean
  criado_em: string
  autor_nome: string | null
  tarefa: { id: string; numero: number; titulo: string } | null
}

/** Últimos avisos do membro logado (sino do menu) e quantos ainda não foram lidos. */
export async function listarAvisos(): Promise<{ itens: Aviso[]; naoLidos: number }> {
  const { supabase, perfil } = await exigirEquipe()
  const [lista, naoLidos] = await Promise.all([
    supabase
      .from('notificacoes')
      .select('id, tipo, titulo, texto, lida_em, criado_em, tarefas(id, numero, titulo), autor:perfis!notificacoes_autor_id_fkey(nome)')
      .eq('perfil_id', perfil.id)
      .order('criado_em', { ascending: false })
      .limit(20),
    supabase
      .from('notificacoes')
      .select('id', { count: 'exact', head: true })
      .eq('perfil_id', perfil.id)
      .is('lida_em', null),
  ])
  // Sem os avisos (ex.: migration ainda não aplicada) o CRM continua funcionando.
  if (lista.error || naoLidos.error) {
    console.error('[avisos]', lista.error ?? naoLidos.error)
    return { itens: [], naoLidos: 0 }
  }

  return {
    itens: lista.data.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      texto: a.texto,
      lido: a.lida_em !== null,
      criado_em: a.criado_em,
      autor_nome: a.autor?.nome ?? null,
      tarefa: a.tarefas,
    })),
    naoLidos: naoLidos.count ?? 0,
  }
}
