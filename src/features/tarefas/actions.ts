'use server'

import { revalidatePath } from 'next/cache'

import { falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { uuid } from '@/lib/validacao'

import {
  BUCKET_TAREFAS,
  esquemaAnexo,
  esquemaComentario,
  esquemaEdicao,
  esquemaMotivo,
  esquemaNovaTarefa,
  esquemaStatus,
  MAX_IMAGENS_POR_ENVIO,
  type DadosAnexo,
  type DadosEdicao,
  type DadosNovaTarefa,
} from './schema'

/** O menu mostra "minhas tarefas abertas": toda mudança atualiza o layout inteiro. */
function atualizarTelas() {
  revalidatePath('/', 'layout')
}

function primeiroErro(erro: { issues: Array<{ message: string }> }) {
  return falha(erro.issues[0]?.message ?? 'Dados inválidos.')
}

export async function criarTarefa(entrada: DadosNovaTarefa): Promise<EstadoAcao & { id?: string }> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaNovaTarefa.safeParse(entrada)
  if (!dados.success) return primeiroErro(dados.error)

  const { responsaveis, ...campos } = dados.data
  const { data, error } = await supabase.rpc('criar_tarefa', { p_dados: campos, p_responsaveis: responsaveis })
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  const { id, numero } = data as { id: string; numero: number }
  return { ...sucesso(`Tarefa #${numero} criada.`), id }
}

export async function moverTarefa(id: string, status: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const novo = esquemaStatus.safeParse(status)
  if (!uuid.safeParse(id).success || !novo.success) return falha('Tarefa inválida.')

  const { error } = await supabase.from('tarefas').update({ status: novo.data }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso()
}

/** Título, descrição, prioridade ou prazo (um ou mais por vez). */
export async function atualizarTarefa(id: string, entrada: DadosEdicao): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(id).success) return falha('Tarefa inválida.')
  const dados = esquemaEdicao.safeParse(entrada)
  if (!dados.success) return primeiroErro(dados.error)

  const { error } = await supabase.from('tarefas').update(dados.data).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso()
}

/** Marca (avisa a pessoa no login dela) ou desmarca um responsável. */
export async function definirResponsavel(id: string, perfilId: string, marcar: boolean): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(id).success || !uuid.safeParse(perfilId).success) return falha('Responsável inválido.')

  if (marcar) {
    const { error } = await supabase.from('tarefa_responsaveis').insert({ tarefa_id: id, perfil_id: perfilId })
    if (error && error.code !== '23505') return falha(traduzirErro(error))
  } else {
    const { count } = await supabase
      .from('tarefa_responsaveis')
      .select('perfil_id', { count: 'exact', head: true })
      .eq('tarefa_id', id)
    if ((count ?? 0) <= 1) return falha('A tarefa precisa de pelo menos um responsável. Marque outra pessoa antes de tirar esta.')
    const { error } = await supabase.from('tarefa_responsaveis').delete().eq('tarefa_id', id).eq('perfil_id', perfilId)
    if (error) return falha(traduzirErro(error))
  }
  atualizarTelas()
  return sucesso()
}

export async function registrarImpedimento(id: string, motivo: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(id).success) return falha('Tarefa inválida.')
  const texto = esquemaMotivo.safeParse(motivo)
  if (!texto.success) return primeiroErro(texto.error)

  const { error } = await supabase.from('tarefas').update({ impedimento: texto.data }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Impedimento registrado. Os envolvidos foram avisados.')
}

/** Tira o impedimento; a nota (como foi resolvido) entra no histórico como comentário. */
export async function resolverImpedimento(id: string, nota: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(id).success) return falha('Tarefa inválida.')
  const comentario = nota.trim() ? esquemaComentario.safeParse(nota) : null
  if (comentario && !comentario.success) return primeiroErro(comentario.error)

  const { error } = await supabase.from('tarefas').update({ impedimento: null }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  if (comentario?.success) {
    const { error: erroNota } = await supabase
      .from('tarefa_eventos')
      .insert({ tarefa_id: id, tipo: 'comentario', texto: comentario.data })
    if (erroNota) return falha(traduzirErro(erroNota))
  }
  atualizarTelas()
  return sucesso('Impedimento resolvido.')
}

export async function comentarTarefa(id: string, texto: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(id).success) return falha('Tarefa inválida.')
  const comentario = esquemaComentario.safeParse(texto)
  if (!comentario.success) return primeiroErro(comentario.error)

  const { error } = await supabase.from('tarefa_eventos').insert({ tarefa_id: id, tipo: 'comentario', texto: comentario.data })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso()
}

export async function apagarComentario(eventoId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(eventoId).success) return falha('Comentário inválido.')

  const { data, error } = await supabase.from('tarefa_eventos').delete().eq('id', eventoId).eq('tipo', 'comentario').select('id')
  if (error) return falha(traduzirErro(error))
  if (!data.length) return falha('Só quem escreveu (ou um administrador) apaga o comentário.')
  atualizarTelas()
  return sucesso('Comentário apagado.')
}

/** Registra as imagens que o navegador já subiu para o bucket (em <tarefa_id>/). */
export async function registrarAnexos(id: string, entrada: DadosAnexo[]): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(id).success) return falha('Tarefa inválida.')
  const lista = esquemaAnexo.array().min(1).max(MAX_IMAGENS_POR_ENVIO).safeParse(entrada)
  if (!lista.success) return primeiroErro(lista.error)
  if (lista.data.some((a) => !a.caminho.startsWith(`${id}/`))) return falha('Imagem inválida para esta tarefa.')

  const { error } = await supabase.from('tarefa_anexos').insert(
    lista.data.map((a) => ({
      tarefa_id: id,
      path: a.caminho,
      nome: a.nome,
      mime: a.mime,
      tamanho: a.tamanho,
      largura: a.largura,
      altura: a.altura,
    })),
  )
  if (error) {
    // Não deixa arquivo sem registro no bucket.
    await supabase.storage.from(BUCKET_TAREFAS).remove(lista.data.map((a) => a.caminho))
    return falha(traduzirErro(error))
  }
  atualizarTelas()
  return sucesso(lista.data.length === 1 ? 'Imagem anexada.' : `${lista.data.length} imagens anexadas.`)
}

export async function removerAnexo(anexoId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(anexoId).success) return falha('Imagem inválida.')

  const { data, error } = await supabase.from('tarefa_anexos').delete().eq('id', anexoId).select('path')
  if (error) return falha(traduzirErro(error))
  if (data.length) await supabase.storage.from(BUCKET_TAREFAS).remove(data.map((a) => a.path))
  atualizarTelas()
  return sucesso('Imagem removida.')
}

/** Exclui a tarefa com histórico e imagens. Só quem criou ou um administrador. */
export async function excluirTarefa(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!uuid.safeParse(id).success) return falha('Tarefa inválida.')

  const { data: anexos } = await supabase.from('tarefa_anexos').select('path').eq('tarefa_id', id)
  const { data, error } = await supabase.from('tarefas').delete().eq('id', id).select('numero')
  if (error) return falha(traduzirErro(error))
  if (!data.length) return falha('Só quem criou a tarefa ou um administrador pode excluí-la.')
  if (anexos?.length) await supabase.storage.from(BUCKET_TAREFAS).remove(anexos.map((a) => a.path))

  atualizarTelas()
  return sucesso(`Tarefa #${data[0].numero} excluída.`)
}
