'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { copiarFotoDaOlist } from '@/features/olist/foto'
import { pedirARotinaEstoque, type PedidoRotinaEstoque } from '@/features/olist/rotina-estoque'
import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formatarNumero } from '@/lib/format'
import { agruparLista, formParaObjeto } from '@/lib/validacao'

import { esquemaLoteEditado, esquemaLoteNovo, esquemaSku, MAX_LOTES_POR_VEZ } from './schema'

/**
 * Lotes e validades. A Olist é só consultada (nome, SKU, foto e estoque do produto):
 * nenhuma ação daqui envia lote, validade ou estoque para lá.
 *
 * Regra que o banco garante: soma dos lotes ≤ estoque da Olist. Quando o estoque lido cai, o
 * banco baixa a diferença do lote que vence primeiro (conciliar_lotes_da_cerveja). Aqui, ao
 * salvar, o estoque é lido na Olist na hora e nenhum lote pode passar do que a Olist tem.
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

  const inicio = new Date().toISOString()
  const consulta = await consultarOlist({ acao: 'lote-produto', id: cerveja.olist_id })
  if (!consulta.ok) return falha(consulta.mensagem)
  const produto = consulta.produto
  if (!produto) return falha('Este produto não existe mais na Olist. O cadastro e os lotes continuam aqui no CRM.')

  const foto = !cerveja.foto_url && produto.foto ? await copiarFotoDaOlist(supabase, produto.foto) : null
  const mudancas = {
    nome: produto.nome.slice(0, 200),
    estoque_olist: produto.estoque,
    estoque_lido_em: new Date().toISOString(),
    releitura_pedida_em: null,
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
  if (produto.estoque === null) return sucesso('Atualizado da Olist. A Olist não informou o estoque deste produto.')
  const baixas = await baixasDesde(supabase, id, inicio)
  return sucesso(`Atualizado da Olist: ${formatarNumero(produto.estoque)} un. em estoque.${baixas ? ` ${baixas}` : ''}`)
}

type Supabase = Awaited<ReturnType<typeof exigirEquipe>>['supabase']

/** "Baixa automática: −4 un. do lote L2411A." — o que o banco tirou dos lotes desde `inicio`. */
async function baixasDesde(supabase: Supabase, cervejaId: string, inicio: string): Promise<string | null> {
  const { data } = await supabase
    .from('lote_movimentos')
    .select('lote, quantidade')
    .eq('cerveja_id', cervejaId)
    .eq('tipo', 'baixa_olist')
    .gte('criado_em', inicio)
    .order('id')
  if (!data?.length) return null
  return `Baixa automática: ${data.map((m) => `${formatarNumero(Math.abs(m.quantidade))} un. do lote ${m.lote}`).join(', ')}.`
}

/**
 * Lê o estoque da cerveja na Olist agora e grava (se caiu, o banco já baixa dos lotes).
 * Se a Olist não responder, segue com a última leitura — devolve false.
 */
async function lerEstoqueAgora(supabase: Supabase, cerveja: { id: string; olist_id: number }): Promise<boolean> {
  const consulta = await consultarOlist({ acao: 'lote-produto', id: cerveja.olist_id })
  if (!consulta.ok || !consulta.produto) return false
  const { error } = await supabase
    .from('lotes_cervejas')
    .update({
      nome: consulta.produto.nome.slice(0, 200),
      estoque_olist: consulta.produto.estoque,
      estoque_lido_em: new Date().toISOString(),
      releitura_pedida_em: null,
    })
    .eq('id', cerveja.id)
  return !error
}

type EstadoDoEstoque = {
  /** Estoque da Olist em unidades inteiras (null = a Olist não informou). */
  estoque: number | null
  lotes: Array<{ id: string; lote: string; quantidade: number | null }>
  /** Soma das quantidades informadas. */
  nosLotes: number
}

async function estadoDoEstoque(supabase: Supabase, cervejaId: string): Promise<EstadoDoEstoque | null> {
  const { data } = await supabase.from('lotes_cervejas').select('estoque_olist, lotes(id, lote, quantidade)').eq('id', cervejaId).maybeSingle()
  if (!data) return null
  return {
    estoque: data.estoque_olist === null ? null : Math.max(Math.floor(Number(data.estoque_olist)), 0),
    lotes: data.lotes,
    nosLotes: data.lotes.reduce((soma, l) => soma + (l.quantidade ?? 0), 0),
  }
}

/** Confere os lotes contra o estoque de novo (fecha a janela em que uma leitura chegou no meio do salvar). */
async function conciliar(supabase: Supabase, cervejaId: string) {
  const { error } = await supabase.rpc('conciliar_lotes', { p_cerveja_id: cervejaId })
  if (error) console.error('[lotes] conciliar', error.message)
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
 * Cadastra um ou vários lotes da cerveja de uma vez (campos "lotes.0.lote", "lotes.0.quantidade",
 * "lotes.0.validade", "lotes.1.lote"...). Linhas totalmente em branco são ignoradas; se alguma
 * linha tiver problema, nada é salvo e o erro aparece no campo dela.
 *
 * Quantidade: lê o estoque da Olist na hora. Os lotes novos dividem as unidades que ainda não
 * estão em lote nenhum; um deles pode ficar em branco e recebe o restante. Nenhum lote passa do
 * que a Olist tem.
 */
export async function adicionarLotes(cervejaId: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '')
  const linhas = agruparLista(formParaObjeto(formData), 'lotes').lotes.slice(0, MAX_LOTES_POR_VEZ)
  const preenchidas = linhas.map((linha, indice) => ({ linha, indice })).filter(({ linha }) => texto(linha.lote) || texto(linha.quantidade) || texto(linha.validade))
  if (preenchidas.length === 0) {
    return { ok: false, mensagem: 'Informe o lote e a validade.', erros: { 'lotes.0.lote': ['Informe o lote.'], 'lotes.0.validade': ['Informe a validade.'] } }
  }

  const { data: cerveja } = await supabase.from('lotes_cervejas').select('id, olist_id').eq('id', cervejaId).maybeSingle()
  if (!cerveja) return falha('Esta cerveja não está mais no controle de lotes.')

  const erros: Record<string, string[]> = {}
  const novos: Array<{ indice: number; lote: string; quantidade: number | null; validade: string }> = []
  for (const { linha, indice } of preenchidas) {
    const dados = esquemaLoteNovo.safeParse(linha)
    if (dados.success) novos.push({ indice, ...dados.data })
    else for (const problema of dados.error.issues) (erros[`lotes.${indice}.${String(problema.path[0])}`] ??= []).push(problema.message)
  }
  if (Object.keys(erros).length) return { ok: false, mensagem: 'Revise os campos destacados.', erros }

  // Estoque da Olist de agora (se caiu, o banco já baixou dos lotes antes da conta).
  await lerEstoqueAgora(supabase, cerveja)
  const estado = await estadoDoEstoque(supabase, cervejaId)
  if (!estado) return falha('Esta cerveja não está mais no controle de lotes.')

  // O mesmo código duas vezes na lista, ou já cadastrado nesta cerveja.
  const cadastrados = new Set(estado.lotes.map((l) => l.lote.toLowerCase()))
  const naLista = new Set<string>()
  for (const { indice, lote } of novos) {
    const codigo = lote.toLowerCase()
    if (cadastrados.has(codigo)) erros[`lotes.${indice}.lote`] = ['Esta cerveja já tem este lote.']
    else if (naLista.has(codigo)) erros[`lotes.${indice}.lote`] = ['Lote repetido nesta lista.']
    naLista.add(codigo)
  }

  const brancos = novos.filter((n) => n.quantidade === null)
  const digitado = novos.reduce((soma, n) => soma + (n.quantidade ?? 0), 0)
  let mensagem = 'Revise os campos destacados.'
  if (estado.estoque === null || estado.lotes.some((l) => l.quantidade === null)) {
    // Sem o estoque (ou com lote sem quantidade) não dá para calcular o restante: tem de digitar.
    const motivo = estado.estoque === null ? 'A Olist não informou o estoque desta cerveja: informe a quantidade.' : 'Informe a quantidade (há lote desta cerveja sem quantidade).'
    for (const b of brancos) erros[`lotes.${b.indice}.quantidade`] = [motivo]
  } else {
    const semLote = Math.max(estado.estoque - estado.nosLotes, 0)
    for (const b of brancos.slice(1)) erros[`lotes.${b.indice}.quantidade`] = ['Só um lote pode ficar em branco: ele recebe o restante.']
    if (digitado > semLote) {
      for (const n of novos) if (n.quantidade !== null) erros[`lotes.${n.indice}.quantidade`] ??= ['Passa do que a Olist tem sem lote.']
      mensagem =
        `A Olist tem ${formatarNumero(estado.estoque)} un. desta cerveja e ${formatarNumero(estado.nosLotes)} já estão nos lotes: sobram ` +
        `${formatarNumero(semLote)} un. sem lote, e os lotes novos somam ${formatarNumero(digitado)}. Se chegou mercadoria, dê entrada na ` +
        'Olist primeiro; se algum lote está com quantidade a mais, corrija-o.'
    } else if (brancos.length) {
      const resto = semLote - digitado
      if (resto <= 0) {
        erros[`lotes.${brancos[0].indice}.quantidade`] ??= ['Não sobra unidade da Olist para este lote.']
        mensagem =
          `Todas as ${formatarNumero(estado.estoque)} un. da Olist já estão nos lotes. Se chegou mercadoria, dê entrada na Olist primeiro ` +
          '(o CRM lê o estoque na hora de salvar); se algum lote está com quantidade a mais, corrija-o.'
      } else brancos[0].quantidade = resto
    }
  }
  if (Object.keys(erros).length) return { ok: false, mensagem, erros }

  const { error } = await supabase.from('lotes').insert(novos.map(({ lote, quantidade, validade }) => ({ cerveja_id: cervejaId, lote, quantidade, validade })))
  if (error) return falha(traduzirErro(error))
  await conciliar(supabase, cervejaId)
  revalidatePath('/lotes', 'layout')

  const comQuantidade = (n: (typeof novos)[number]) => `${n.lote} (${n.quantidade === null ? '—' : `${formatarNumero(n.quantidade)} un.`})`
  return sucesso(novos.length === 1 ? `Lote ${comQuantidade(novos[0])} cadastrado.` : `Lotes cadastrados: ${novos.map(comQuantidade).join(', ')}.`)
}

/**
 * Edita lote, validade e quantidade. O estoque da Olist é lido na hora: o lote pode ter no
 * máximo o estoque menos o que está nos outros lotes. Diminuir deixa unidades "sem lote".
 */
export async function editarLote(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaLoteEditado.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { data: atual } = await supabase.from('lotes').select('cerveja_id, lotes_cervejas(id, olist_id)').eq('id', id).maybeSingle()
  if (!atual?.lotes_cervejas) return falha('Lote não encontrado.')
  await lerEstoqueAgora(supabase, atual.lotes_cervejas)
  const estado = await estadoDoEstoque(supabase, atual.cerveja_id)
  if (!estado) return falha('Lote não encontrado.')

  const outros = estado.lotes.filter((l) => l.id !== id)
  if (estado.estoque !== null && outros.every((l) => l.quantidade !== null)) {
    const nosOutros = outros.reduce((soma, l) => soma + (l.quantidade ?? 0), 0)
    const maximo = Math.max(estado.estoque - nosOutros, 0)
    if (dados.data.quantidade > maximo) {
      return {
        ok: false,
        mensagem: 'Revise os campos destacados.',
        erros: {
          quantidade: [
            `No máximo ${formatarNumero(maximo)} un.: a Olist tem ${formatarNumero(estado.estoque)}${nosOutros ? ` e os outros lotes somam ${formatarNumero(nosOutros)}` : ''}.`,
          ],
        },
      }
    }
  }

  const { error } = await supabase.from('lotes').update(dados.data).eq('id', id)
  if (error) return falha(traduzirErro(error))
  await conciliar(supabase, atual.cerveja_id)
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
