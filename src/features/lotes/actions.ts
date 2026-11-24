'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { copiarFotoDaOlist } from '@/features/olist/foto'
import { pedirARotinaEstoque, type PedidoRotinaEstoque } from '@/features/olist/rotina-estoque'
import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formatarNumero } from '@/lib/format'
import { agruparLista, formParaObjeto } from '@/lib/validacao'

import { esquemaLote, esquemaSku, MAX_LOTES_POR_VEZ } from './schema'

/**
 * Lotes e validades. A Olist é só consultada (nome, SKU, foto e estoque do produto):
 * nenhuma ação daqui envia lote, validade ou estoque para lá.
 */

const BUCKET_FOTOS = 'produtos'

/** Consulta um produto na Olist pela rotina do estoque (a tela não lê os tokens). */
async function consultarOlist(pedido: Extract<PedidoRotinaEstoque, { acao: 'lote-sku' | 'lote-produto' }>) {
  const resposta = await pedirARotinaEstoque(pedido)
  if ('produtoLote' in resposta) return { ok: true as const, produto: resposta.produtoLote }
  return { ok: false as const, mensagem: 'mensagem' in resposta ? resposta.mensagem : 'Não foi possível consultar a Olist. Tente de novo em instantes.' }
}

/**
 * Puxa a cerveja da Olist pelo SKU e a cadastra no controle (foto principal, nome, SKU e
 * unidades em estoque). Se ela já estiver cadastrada, só abre o cadastro.
 */
export async function cadastrarCervejaPorSku(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaSku.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { sku } = dados.data

  // Já está no controle com este SKU: abre direto, sem consultar a Olist.
  const { data: peloSku } = await supabase.from('lotes_cervejas').select('id').eq('sku', sku).maybeSingle()
  if (peloSku) redirect(`/lotes/${peloSku.id}`)

  const consulta = await consultarOlist({ acao: 'lote-sku', sku })
  if (!consulta.ok) return falha(consulta.mensagem)
  const produto = consulta.produto
  if (!produto) return falha(`Nenhum produto com o SKU “${sku}” na Olist. Confira o código (SKU) no cadastro do produto lá.`)

  // Mesmo produto cadastrado com o SKU escrito de outro jeito (ou trocado na Olist).
  const { data: peloProduto } = await supabase.from('lotes_cervejas').select('id').eq('olist_id', produto.id).maybeSingle()
  if (peloProduto) redirect(`/lotes/${peloProduto.id}`)

  const foto = produto.foto ? await copiarFotoDaOlist(supabase, produto.foto) : null
  const { data: cerveja, error } = await supabase
    .from('lotes_cervejas')
    .insert({
      sku: (produto.sku ?? sku).slice(0, 60),
      olist_id: produto.id,
      nome: produto.nome.slice(0, 200),
      foto_url: foto,
      estoque_olist: produto.estoque,
      estoque_lido_em: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) return falha(traduzirErro(error))

  revalidatePath('/lotes', 'layout')
  redirect(`/lotes/${cerveja.id}`)
}

/** Relê nome, SKU e estoque da cerveja na Olist (e a foto, se ainda não houver). */
export async function atualizarCervejaDaOlist(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: cerveja } = await supabase.from('lotes_cervejas').select('id, olist_id, foto_url').eq('id', id).maybeSingle()
  if (!cerveja) return falha('Cerveja não encontrada.')

  const consulta = await consultarOlist({ acao: 'lote-produto', id: cerveja.olist_id })
  if (!consulta.ok) return falha(consulta.mensagem)
  const produto = consulta.produto
  if (!produto) return falha('Este produto não existe mais na Olist. O cadastro e os lotes continuam aqui no CRM.')

  const foto = !cerveja.foto_url && produto.foto ? await copiarFotoDaOlist(supabase, produto.foto) : null
  const mudancas = {
    nome: produto.nome.slice(0, 200),
    estoque_olist: produto.estoque,
    estoque_lido_em: new Date().toISOString(),
    ...(foto ? { foto_url: foto } : {}),
  }
  let { error } = await supabase
    .from('lotes_cervejas')
    .update({ ...mudancas, ...(produto.sku ? { sku: produto.sku.slice(0, 60) } : {}) })
    .eq('id', id)
  // O SKU novo já é de outra cerveja do controle: atualiza o resto e mantém o SKU atual.
  if (error?.code === '23505') ({ error } = await supabase.from('lotes_cervejas').update(mudancas).eq('id', id))
  if (error) return falha(traduzirErro(error))

  revalidatePath('/lotes', 'layout')
  return sucesso(
    produto.estoque === null
      ? 'Atualizado da Olist. A Olist não informou o estoque deste produto.'
      : `Atualizado da Olist: ${formatarNumero(produto.estoque)} un. em estoque.`,
  )
}

/** Tira a cerveja do controle, com todos os lotes dela. Nada muda na Olist. */
export async function removerCervejaDosLotes(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: removida, error } = await supabase.from('lotes_cervejas').delete().eq('id', id).select('foto_url').maybeSingle()
  if (error) return falha(traduzirErro(error))

  // A foto copiada da Olist era só deste cadastro.
  const caminho = removida?.foto_url?.split(`/object/public/${BUCKET_FOTOS}/`)[1]
  if (caminho) {
    const { error: erroFoto } = await supabase.storage.from(BUCKET_FOTOS).remove([decodeURIComponent(caminho)])
    if (erroFoto) console.error('[lotes] foto não removida', erroFoto.message)
  }

  revalidatePath('/lotes', 'layout')
  redirect('/lotes')
}

/**
 * Cadastra um ou vários lotes da cerveja de uma vez (campos "lotes.0.lote", "lotes.0.validade",
 * "lotes.1.lote"...). Linhas totalmente em branco são ignoradas; se alguma linha tiver problema,
 * nada é salvo e o erro aparece no campo dela.
 */
export async function adicionarLotes(cervejaId: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '')
  const linhas = agruparLista(formParaObjeto(formData), 'lotes').lotes.slice(0, MAX_LOTES_POR_VEZ)
  const preenchidas = linhas.map((linha, indice) => ({ linha, indice })).filter(({ linha }) => texto(linha.lote) || texto(linha.validade))
  if (preenchidas.length === 0) {
    return { ok: false, mensagem: 'Informe o lote e a validade.', erros: { 'lotes.0.lote': ['Informe o lote.'], 'lotes.0.validade': ['Informe a validade.'] } }
  }

  const erros: Record<string, string[]> = {}
  const novos: Array<{ indice: number; lote: string; validade: string }> = []
  for (const { linha, indice } of preenchidas) {
    const dados = esquemaLote.safeParse(linha)
    if (dados.success) novos.push({ indice, ...dados.data })
    else for (const problema of dados.error.issues) (erros[`lotes.${indice}.${String(problema.path[0])}`] ??= []).push(problema.message)
  }

  // O mesmo código duas vezes na lista, ou já cadastrado nesta cerveja.
  const { data: existentes, error: erroLeitura } = await supabase.from('lotes').select('lote').eq('cerveja_id', cervejaId)
  if (erroLeitura) return falha(traduzirErro(erroLeitura))
  const cadastrados = new Set((existentes ?? []).map((l) => l.lote.toLowerCase()))
  const naLista = new Set<string>()
  for (const { indice, lote } of novos) {
    const codigo = lote.toLowerCase()
    if (cadastrados.has(codigo)) erros[`lotes.${indice}.lote`] = ['Esta cerveja já tem este lote.']
    else if (naLista.has(codigo)) erros[`lotes.${indice}.lote`] = ['Lote repetido nesta lista.']
    naLista.add(codigo)
  }
  if (Object.keys(erros).length) return { ok: false, mensagem: 'Revise os campos destacados.', erros }

  const { error } = await supabase.from('lotes').insert(novos.map(({ lote, validade }) => ({ cerveja_id: cervejaId, lote, validade })))
  if (error) return falha(traduzirErro(error))
  revalidatePath('/lotes', 'layout')
  return sucesso(novos.length === 1 ? `Lote ${novos[0].lote} cadastrado.` : `${novos.length} lotes cadastrados.`)
}

export async function editarLote(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaLote.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.from('lotes').update(dados.data).eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/lotes', 'layout')
  return sucesso('Lote atualizado.')
}

export async function excluirLote(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('lotes').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  revalidatePath('/lotes', 'layout')
  return sucesso('Lote excluído.')
}
