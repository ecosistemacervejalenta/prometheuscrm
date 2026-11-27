'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { copiarFotoDaOlist } from '@/features/olist/foto'
import { pedirARotinaEstoque } from '@/features/olist/rotina-estoque'
import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formatarNumero } from '@/lib/format'
import { agruparLista, formParaObjeto } from '@/lib/validacao'

import { codigoDeBarras, esquemaCodigo, esquemaLoteEditado, esquemaLoteNovo, MAX_LOTES_POR_VEZ } from './schema'

/**
 * Lotes e validades. A Olist é só consultada (nome, SKU, foto e estoque do produto):
 * nenhuma ação daqui envia lote, validade ou estoque para lá.
 *
 * Regra que o banco garante: soma dos lotes ≤ estoque da Olist. Quando o estoque lido cai, o
 * banco baixa a diferença do lote que vence primeiro (conciliar_lotes_da_cerveja). Aqui, ao
 * salvar, o estoque é lido na Olist na hora e nenhum lote pode passar do que a Olist tem.
 */

const BUCKET_FOTOS = 'produtos'

const SEM_RESPOSTA_DA_OLIST = 'Não foi possível consultar a Olist. Tente de novo em instantes.'

type RespostaDaRotina = Awaited<ReturnType<typeof pedirARotinaEstoque>>
const erroDaRotina = (resposta: RespostaDaRotina) => ({ ok: false as const, mensagem: 'mensagem' in resposta ? resposta.mensagem : SEM_RESPOSTA_DA_OLIST })

/** Lê um produto na Olist pelo id, pela rotina do estoque (a tela não lê os tokens). */
async function consultarOlist(pedido: { acao: 'lote-produto'; id: number }) {
  const resposta = await pedirARotinaEstoque(pedido)
  if ('produtoLote' in resposta) return { ok: true as const, produto: resposta.produtoLote }
  return erroDaRotina(resposta)
}

/** Qual produto da Olist tem este SKU (só a listagem, sem o detalhe). */
async function acharSkuNaOlist(sku: string) {
  const resposta = await pedirARotinaEstoque({ acao: 'lote-sku', sku })
  if ('produtoAchado' in resposta) return { ok: true as const, produto: resposta.produtoAchado }
  return erroDaRotina(resposta)
}

/** Produtos da Olist com este código de barras (EAN), ativos primeiro. */
async function consultarGtinNaOlist(gtin: string) {
  const resposta = await pedirARotinaEstoque({ acao: 'lote-gtin', gtin })
  if ('produtosGtin' in resposta) return { ok: true as const, produtos: resposta.produtosGtin }
  return erroDaRotina(resposta)
}

const listaDeSkus = (itens: Array<{ sku: string | null }>) => itens.map((i) => i.sku ?? '—').join(', ')

/** Prévia de uma cerveja da Olist que ainda não está no controle (consultar não grava nada). */
const enderecoDaPrevia = (olistId: number, codigo: string) => `/lotes/novo?${new URLSearchParams({ produto: String(olistId), codigo })}`

/**
 * Procura a cerveja na Olist pelo código de barras (EAN, bipado no leitor) ou pelo SKU. SÓ
 * CONSULTA: se ela já está no controle, abre o cadastro dela; se não, abre a prévia (foto, nome,
 * SKU e estoque) com o formulário do lote — ela só entra no controle quando o lote é salvo
 * (cadastrarCervejaComLotes). Código com cara de EAN (só dígitos: 8, 12, 13 ou 14) é procurado
 * primeiro pelo código de barras e, se nenhum produto tiver esse EAN, pelo SKU (há SKUs só com
 * números).
 */
export async function consultarCervejaPorCodigo(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaCodigo.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { codigo } = dados.data

  // Já está no controle com este SKU: abre direto, sem consultar a Olist.
  const { data: peloSku } = await supabase.from('lotes_cervejas').select('id').eq('sku', codigo).maybeSingle()
  if (peloSku) redirect(`/lotes/${peloSku.id}`)

  const gtin = codigoDeBarras(codigo)
  if (gtin) {
    const consulta = await consultarGtinNaOlist(gtin)
    if (!consulta.ok) return falha(consulta.mensagem)
    if (consulta.produtos.length) {
      const ids = consulta.produtos.map((p) => p.id)
      const { data: noControle } = await supabase.from('lotes_cervejas').select('id, sku').in('olist_id', ids)
      if (noControle?.length === 1) redirect(`/lotes/${noControle[0].id}`)
      if (noControle && noControle.length > 1) {
        return falha(`Mais de uma cerveja do controle tem o código de barras ${gtin} na Olist (SKU ${listaDeSkus(noControle)}). Digite o SKU da que você quer abrir.`)
      }

      // EAN repetido em mais de um produto da Olist: não chuta qual é.
      const ativos = consulta.produtos.filter((p) => p.ativo)
      const opcoes = ativos.length ? ativos : consulta.produtos
      if (opcoes.length > 1) {
        return falha(
          `${opcoes.length} produtos da Olist têm o código de barras ${gtin}: ${opcoes.map((p) => `${p.nome} (SKU ${p.sku ?? '—'})`).join('; ')}. Digite o SKU da cerveja certa.`,
        )
      }
      redirect(enderecoDaPrevia(opcoes[0].id, codigo))
    }
  }

  const consulta = await acharSkuNaOlist(codigo)
  if (!consulta.ok) return falha(consulta.mensagem)
  if (!consulta.produto) {
    return falha(
      gtin
        ? `Nenhum produto da Olist tem o código de barras ou o SKU “${codigo}”. Confira o EAN (GTIN) e o código (SKU) no cadastro do produto lá.`
        : `Nenhum produto com o SKU “${codigo}” na Olist. Confira o código (SKU) no cadastro do produto lá.`,
    )
  }

  // Mesmo produto cadastrado com o SKU escrito de outro jeito (ou trocado na Olist).
  const { data: peloProduto } = await supabase.from('lotes_cervejas').select('id').eq('olist_id', consulta.produto.id).maybeSingle()
  if (peloProduto) redirect(`/lotes/${peloProduto.id}`)
  redirect(enderecoDaPrevia(consulta.produto.id, codigo))
}

/** Relê nome, SKU e estoque da cerveja na Olist (e a foto, se ainda não houver). */
export async function atualizarCervejaDaOlist(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data: cerveja } = await supabase.from('lotes_cervejas').select('id, olist_id, foto_url').eq('id', id).maybeSingle()
  if (!cerveja) return falha('Cerveja não encontrada.')

  const inicio = new Date().toISOString()
  const consulta = await consultarOlist({ acao: 'lote-produto', id: cerveja.olist_id })
  if (!consulta.ok || !consulta.produto) {
    const motivo = !consulta.ok ? consulta.mensagem : 'Este produto não existe mais na Olist. O cadastro e os lotes continuam aqui no CRM.'
    await registrarFalhaDeLeitura(supabase, id, 'botao', consulta.ok ? 'Produto não encontrado na Olist.' : motivo)
    revalidatePath('/lotes', 'layout')
    return falha(motivo)
  }
  const produto = consulta.produto

  const foto = !cerveja.foto_url && produto.foto ? await copiarFotoDaOlist(supabase, produto.foto) : null
  const mudancas = {
    nome: produto.nome.slice(0, 200),
    estoque_olist: produto.estoque,
    estoque_lido_em: new Date().toISOString(),
    estoque_origem: 'botao',
    releitura_pedida_em: null,
    leitura_erro: null,
    leitura_erro_em: null,
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

/** Guarda na cerveja (e no histórico dela) que a leitura na Olist falhou e por quê. */
async function registrarFalhaDeLeitura(supabase: Supabase, cervejaId: string, origem: 'botao' | 'salvar_lote', motivo: string) {
  const { error } = await supabase
    .from('lotes_cervejas')
    .update({ estoque_origem: origem, leitura_erro: motivo.slice(0, 300), leitura_erro_em: new Date().toISOString() })
    .eq('id', cervejaId)
  if (error) console.error('[lotes] falha de leitura', error.message)
}

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
  return `Baixa automática: ${data.map((m) => `${formatarNumero(Math.abs(m.quantidade ?? 0))} un. do lote ${m.lote ?? '—'}`).join(', ')}.`
}

/**
 * Lê o estoque da cerveja na Olist agora e grava (se caiu, o banco já baixa dos lotes).
 * Se a Olist não responder, segue com a última leitura — devolve false.
 */
async function lerEstoqueAgora(supabase: Supabase, cerveja: { id: string; olist_id: number }): Promise<boolean> {
  const consulta = await consultarOlist({ acao: 'lote-produto', id: cerveja.olist_id })
  if (!consulta.ok || !consulta.produto) {
    await registrarFalhaDeLeitura(supabase, cerveja.id, 'salvar_lote', consulta.ok ? 'Produto não encontrado na Olist.' : consulta.mensagem)
    return false
  }
  const { error } = await supabase
    .from('lotes_cervejas')
    .update({
      nome: consulta.produto.nome.slice(0, 200),
      estoque_olist: consulta.produto.estoque,
      estoque_lido_em: new Date().toISOString(),
      estoque_origem: 'salvar_lote',
      releitura_pedida_em: null,
      leitura_erro: null,
      leitura_erro_em: null,
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

  await apagarFotoCopiada(supabase, removida?.foto_url)

  revalidatePath('/lotes', 'layout')
  redirect('/lotes')
}

/** Apaga do Storage a foto copiada da Olist (ela era só deste cadastro). */
async function apagarFotoCopiada(supabase: Supabase, url: string | null | undefined) {
  const caminho = url?.split(`/object/public/${BUCKET_FOTOS}/`)[1]
  if (!caminho) return
  const { error } = await supabase.storage.from(BUCKET_FOTOS).remove([decodeURIComponent(caminho)])
  if (error) console.error('[lotes] foto não removida', error.message)
}

type LoteNovo = { indice: number; lote: string; quantidade: number | null; validade: string }

/**
 * Lê as linhas do formulário ("lotes.0.lote", "lotes.0.quantidade", "lotes.0.validade",
 * "lotes.1.lote"...). Linhas totalmente em branco são ignoradas; se alguma linha tiver problema,
 * volta o erro no campo dela.
 */
function lerLotesDoFormulario(formData: FormData): { novos: LoteNovo[] } | { erro: EstadoAcao } {
  const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '')
  const linhas = agruparLista(formParaObjeto(formData), 'lotes').lotes.slice(0, MAX_LOTES_POR_VEZ)
  const preenchidas = linhas.map((linha, indice) => ({ linha, indice })).filter(({ linha }) => texto(linha.lote) || texto(linha.quantidade) || texto(linha.validade))
  if (preenchidas.length === 0) {
    return { erro: { ok: false, mensagem: 'Informe o lote e a validade.', erros: { 'lotes.0.lote': ['Informe o lote.'], 'lotes.0.validade': ['Informe a validade.'] } } }
  }

  const erros: Record<string, string[]> = {}
  const novos: LoteNovo[] = []
  for (const { linha, indice } of preenchidas) {
    const dados = esquemaLoteNovo.safeParse(linha)
    if (dados.success) novos.push({ indice, ...dados.data })
    else for (const problema of dados.error.issues) (erros[`lotes.${indice}.${String(problema.path[0])}`] ??= []).push(problema.message)
  }
  if (Object.keys(erros).length) return { erro: { ok: false, mensagem: 'Revise os campos destacados.', erros } }
  return { novos }
}

/**
 * Confere os lotes novos contra o estoque da Olist e os lotes que a cerveja já tem: código
 * repetido, e nenhum lote passa do que a Olist tem sem lote. Um lote pode ficar em branco e
 * recebe o restante (preenchido aqui, em `novos`). Devolve o erro, ou null se pode salvar.
 */
function conferirLotesNovos(novos: LoteNovo[], estado: EstadoDoEstoque): EstadoAcao | null {
  const erros: Record<string, string[]> = {}

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
  return Object.keys(erros).length ? { ok: false, mensagem, erros } : null
}

const linhasParaGravar = (cervejaId: string, novos: LoteNovo[]) => novos.map(({ lote, quantidade, validade }) => ({ cerveja_id: cervejaId, lote, quantidade, validade }))

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
  const lidos = lerLotesDoFormulario(formData)
  if ('erro' in lidos) return lidos.erro
  const { novos } = lidos

  const { data: cerveja } = await supabase.from('lotes_cervejas').select('id, olist_id').eq('id', cervejaId).maybeSingle()
  if (!cerveja) return falha('Esta cerveja não está mais no controle de lotes.')

  // Estoque da Olist de agora (se caiu, o banco já baixou dos lotes antes da conta).
  await lerEstoqueAgora(supabase, cerveja)
  const estado = await estadoDoEstoque(supabase, cervejaId)
  if (!estado) return falha('Esta cerveja não está mais no controle de lotes.')
  const problema = conferirLotesNovos(novos, estado)
  if (problema) return problema

  const { error } = await supabase.from('lotes').insert(linhasParaGravar(cervejaId, novos))
  if (error) return falha(traduzirErro(error))
  await conciliar(supabase, cervejaId)
  revalidatePath('/lotes', 'layout')

  const comQuantidade = (n: LoteNovo) => `${n.lote} (${n.quantidade === null ? '—' : `${formatarNumero(n.quantidade)} un.`})`
  return sucesso(novos.length === 1 ? `Lote ${comQuantidade(novos[0])} cadastrado.` : `Lotes cadastrados: ${novos.map(comQuantidade).join(', ')}.`)
}

/**
 * Primeiro lote de uma cerveja que ainda não está no controle (vem da prévia da busca): só aqui
 * ela entra no controle, junto com o(s) lote(s). Lê o produto na Olist na hora (estoque de agora)
 * e confere os lotes ANTES de gravar qualquer coisa; se mesmo assim os lotes não puderem ser
 * gravados, a cerveja é desfeita (não fica cadastro pela metade).
 * `codigo`: o que foi bipado/digitado, usado como SKU só se o produto não tiver SKU na Olist.
 */
export async function cadastrarCervejaComLotes(olistId: number, codigo: string, estadoAnterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!Number.isSafeInteger(olistId) || olistId <= 0) return falha('Produto inválido. Volte e busque a cerveja de novo.')
  const lidos = lerLotesDoFormulario(formData)
  if ('erro' in lidos) return lidos.erro
  const { novos } = lidos

  // Já entrou no controle (outra aba ou outra pessoa): os lotes vão para o cadastro que existe.
  const { data: existente } = await supabase.from('lotes_cervejas').select('id').eq('olist_id', olistId).maybeSingle()
  if (existente) {
    const resultado = await adicionarLotes(existente.id, estadoAnterior, formData)
    if (!resultado.ok) return resultado
    redirect(`/lotes/${existente.id}`)
  }

  const consulta = await consultarOlist({ acao: 'lote-produto', id: olistId })
  if (!consulta.ok) return falha(consulta.mensagem)
  if (!consulta.produto) return falha('Este produto não existe mais na Olist. Volte e busque a cerveja de novo.')
  const produto = consulta.produto
  const estoque = produto.estoque === null ? null : Math.max(Math.floor(Number(produto.estoque)), 0)
  const problema = conferirLotesNovos(novos, { estoque, lotes: [], nosLotes: 0 })
  if (problema) return problema

  const foto = produto.foto ? await copiarFotoDaOlist(supabase, produto.foto) : null
  const { data: cerveja, error } = await supabase
    .from('lotes_cervejas')
    .insert({
      sku: (produto.sku ?? (String(codigo ?? '').trim() || String(produto.id))).slice(0, 60),
      olist_id: produto.id,
      nome: produto.nome.slice(0, 200),
      foto_url: foto,
      estoque_olist: produto.estoque,
      estoque_lido_em: new Date().toISOString(),
      estoque_origem: 'cadastro',
    })
    .select('id')
    .single()
  if (error) {
    await apagarFotoCopiada(supabase, foto)
    return falha(traduzirErro(error))
  }

  const { error: erroLotes } = await supabase.from('lotes').insert(linhasParaGravar(cerveja.id, novos))
  if (erroLotes) {
    // Sem os lotes a cerveja não fica no controle (nem a foto copiada).
    await supabase.from('lotes_cervejas').delete().eq('id', cerveja.id)
    await apagarFotoCopiada(supabase, foto)
    return falha(traduzirErro(erroLotes))
  }
  await conciliar(supabase, cerveja.id)
  revalidatePath('/lotes', 'layout')
  redirect(`/lotes/${cerveja.id}`)
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
