import 'server-only'

import { exigirEquipe } from '@/lib/auth'

export type Aviso = {
  id: string
  tipo: string
  titulo: string
  texto: string | null
  quantidade: number
  lido: boolean
  criado_em: string
  autor_nome: string | null
  tarefa: { id: string; numero: number; titulo: string } | null
  /** Conversa do WhatsApp (avisos de mensagem e de transferência). */
  atendimento_id: string | null
  /** Pedido (aviso de PIX recebido pelo Mercado Pago). */
  pedido_id: string | null
  /** Campanha (aprovada pela Meta / escolher quando enviar). */
  campanha_id: string | null
  /** Cerveja do módulo Lotes e validades (entrou mercadoria sem lote). */
  lote_cerveja_id: string | null
}

/** Últimos avisos do membro logado (sino do menu: tarefas e WhatsApp) e quantos ainda não foram lidos. */
export async function listarAvisos(): Promise<{ itens: Aviso[]; naoLidos: number }> {
  const { supabase, perfil } = await exigirEquipe()
  const [lista, naoLidos] = await Promise.all([
    supabase
      .from('notificacoes')
      .select(
        'id, tipo, titulo, texto, quantidade, atendimento_id, pedido_id, campanha_id, lote_cerveja_id, lida_em, criado_em, tarefas(id, numero, titulo), autor:perfis!notificacoes_autor_id_fkey(nome)',
      )
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
      quantidade: a.quantidade,
      lido: a.lida_em !== null,
      criado_em: a.criado_em,
      autor_nome: a.autor?.nome ?? null,
      tarefa: a.tarefas,
      atendimento_id: a.atendimento_id,
      pedido_id: a.pedido_id,
      campanha_id: a.campanha_id,
      lote_cerveja_id: a.lote_cerveja_id,
    })),
    naoLidos: naoLidos.count ?? 0,
  }
}
