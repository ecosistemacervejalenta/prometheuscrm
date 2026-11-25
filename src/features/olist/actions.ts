'use server'

import { revalidatePath } from 'next/cache'

import { falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import { urlDoSite } from '@/lib/url'

import type { CervejaSalva } from '@/features/produtos/actions'
import { lerKit } from '@/features/produtos/kit'

import { dispararSincronizacao } from './disparo'
import type { DetalheBuscaOlist, PaginaBuscaComEstoque } from './estoque'
import { copiarFotoDaOlist } from './foto'
import { agendarEnvioEstoqueOlist, pedirARotinaEstoque } from './rotina-estoque'

function atualizarTelas() {
  revalidatePath('/')
  revalidatePath('/configuracoes', 'layout')
}

export async function sincronizarOlistAgora(): Promise<EstadoAcao> {
  await exigirEquipe()
  if (!envServidor.cronSecret) return falha('Configure CRON_SECRET na Vercel para sincronizar com o Olist.')

  const resultado = await dispararSincronizacao(await urlDoSite(), 'rapida')
  atualizarTelas()
  if (!resultado) return falha('Não foi possível iniciar a sincronização. Tente de novo em instantes.')
  if (resultado.ok) {
    return sucesso(
      resultado.completa
        ? `Histórico importado do Olist: ${resultado.pedidos} pedido(s).`
        : `Olist atualizado: ${resultado.pedidos} pedido(s) conferidos.`,
    )
  }
  if (resultado.codigo === 'em_andamento') return sucesso('Uma sincronização já está em andamento. Atualize a página em instantes.')
  return falha(resultado.motivo)
}

export async function desconectarOlist(): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('desconectar_olist')
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Olist desconectado. Os pedidos já sincronizados continuam no histórico.')
}

// -----------------------------------------------------------------------------
// Estoque da Olist nas pré-vendas
// -----------------------------------------------------------------------------

export type ResultadoBuscaOlistTela =
  | ({ ok: true } & PaginaBuscaComEstoque)
  | { ok: false; mensagem: string }

/** Busca produtos ativos na Olist (nome ou SKU), 20 por página (offset = "Ver mais"). */
export async function buscarProdutosNaOlist(termo: string, offset = 0): Promise<ResultadoBuscaOlistTela> {
  await exigirEquipe()
  const busca = termo.trim()
  if (busca.length < 2) return { ok: false, mensagem: 'Digite pelo menos 2 letras do nome ou o SKU.' }
  const resposta = await pedirARotinaEstoque({ acao: 'buscar', termo: busca.slice(0, 80), offset: Math.max(0, Math.floor(offset) || 0) })
  if ('produtos' in resposta) return { ok: true, produtos: resposta.produtos, total: resposta.total, proximo: resposta.proximo }
  return { ok: false, mensagem: 'mensagem' in resposta ? resposta.mensagem : 'Não foi possível buscar na Olist.' }
}

/** Foto e estoque de alguns resultados da busca (a tela pede aos poucos). */
export async function detalhesProdutosNaOlist(ids: number[]): Promise<DetalheBuscaOlist[]> {
  await exigirEquipe()
  const validos = ids.filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 6)
  if (validos.length === 0) return []
  const resposta = await pedirARotinaEstoque({ acao: 'detalhes', ids: validos })
  return 'detalhes' in resposta ? resposta.detalhes : validos.map((id) => ({ id, foto: null, estoque: null, ok: false }))
}

export type ResultadoImportacaoOlist = { ok: true; cerveja: CervejaSalva; novo: boolean } | { ok: false; mensagem: string }

const CAMPOS_CERVEJA = 'id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco, imagem_url, fotos, cervejas_do_kit, olist_id'

/**
 * Traz um produto da Olist para o catálogo (ou vincula o que já existe com o mesmo SKU):
 * título, foto principal, preço como sugestão e, se for kit, as cervejas do kit.
 * A partir daí o estoque da Olist vale na pré-venda e cada venda baixa lá.
 */
export async function importarProdutoDaOlist(olistId: number): Promise<ResultadoImportacaoOlist> {
  const { supabase } = await exigirEquipe()
  if (!Number.isSafeInteger(olistId) || olistId <= 0) return { ok: false, mensagem: 'Produto inválido.' }

  const resposta = await pedirARotinaEstoque({ acao: 'produto', id: olistId })
  if (!('produto' in resposta)) return { ok: false, mensagem: 'mensagem' in resposta ? resposta.mensagem : 'Não foi possível ler o produto na Olist.' }
  const produto = resposta.produto
  if (!produto.controlaEstoque) {
    return { ok: false, mensagem: `“${produto.nome}” não controla estoque na Olist. Ative o controle de estoque do produto lá e tente de novo.` }
  }

  const olistKit = produto.kit.map((k) => ({ id: k.id, sku: k.sku, nome: k.nome, quantidade: k.quantidade }))
  const cervejasDoKit = produto.kit.map((k) => ({ nome: k.nome.slice(0, 120), cervejaria: null, estilo: null, teor_alcoolico: null, volume_ml: null, quantidade: Math.min(k.quantidade, 99), descricao: null }))

  // Já existe no catálogo? Pelo vínculo; senão, pelo mesmo SKU (ainda sem vínculo).
  const { data: porVinculo } = await supabase.from('produtos').select('id, fotos, cervejas_do_kit').eq('olist_id', produto.id).maybeSingle()
  const { data: porSku } =
    porVinculo || !produto.sku
      ? { data: null }
      : await supabase.from('produtos').select('id, fotos, cervejas_do_kit').eq('sku', produto.sku).is('olist_id', null).maybeSingle()
  const existente = porVinculo ?? porSku

  const foto = !existente?.fotos?.length && produto.foto ? await copiarFotoDaOlist(supabase, produto.foto) : null
  const kitVazio = !Array.isArray(existente?.cervejas_do_kit) || existente.cervejas_do_kit.length === 0

  let salvo
  if (existente) {
    const { data, error } = await supabase
      .from('produtos')
      .update({
        olist_id: produto.id,
        olist_kit: olistKit,
        ativo: true,
        ...(foto ? { fotos: [foto] } : {}),
        ...(cervejasDoKit.length && kitVazio ? { cervejas_do_kit: cervejasDoKit } : {}),
      })
      .eq('id', existente.id)
      .select(CAMPOS_CERVEJA)
      .single()
    if (error) return { ok: false, mensagem: traduzirErro(error) }
    salvo = data
  } else {
    const novo = {
      nome: produto.nome.slice(0, 200),
      preco: Math.max(0, Math.round((produto.preco ?? 0) * 100) / 100),
      ativo: true,
      olist_id: produto.id,
      olist_kit: olistKit,
      cervejas_do_kit: cervejasDoKit,
      fotos: foto ? [foto] : [],
    }
    let { data, error } = await supabase
      .from('produtos')
      .insert({ ...novo, sku: produto.sku })
      .select(CAMPOS_CERVEJA)
      .single()
    // SKU já usado por outro produto do catálogo: cadastra sem o SKU.
    if (error?.code === '23505' && produto.sku) {
      ;({ data, error } = await supabase.from('produtos').insert(novo).select(CAMPOS_CERVEJA).single())
    }
    if (error || !data) return { ok: false, mensagem: error ? traduzirErro(error) : 'Não foi possível cadastrar a cerveja.' }
    salvo = data
  }

  const { data: estoque } = await supabase.rpc('estoque_olist_produto', { p_produto_id: salvo.id })
  revalidatePath('/produtos')
  return {
    ok: true,
    novo: !existente,
    cerveja: {
      ...salvo,
      preco: Number(salvo.preco),
      teor_alcoolico: salvo.teor_alcoolico === null ? null : Number(salvo.teor_alcoolico),
      fotos: salvo.fotos ?? [],
      cervejas_do_kit: lerKit(salvo.cervejas_do_kit),
      estoque_olist: estoque ?? null,
    },
  }
}

/**
 * Botão da pré-venda: devolve à Olist tudo o que esta pré-venda baixou lá (toda a equipe pode).
 * Pedidos e Caixas VIP continuam como estão; essas unidades não voltam a baixar nem a devolver.
 * Na Olist, o lançamento fica registrado como DEVOLUÇÃO MANUAL (quem, quando, qual pré-venda).
 */
export async function devolverEstoqueOlistPreVenda(preVendaId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('devolver_estoque_olist_pre_venda', { p_pre_venda_id: preVendaId })
  if (error) return falha(traduzirErro(error))
  const resultado = (data ?? {}) as { unidades?: number; pedidos?: number }
  const unidades = resultado.unidades ?? 0
  if (unidades <= 0) return sucesso('Nada para devolver: esta pré-venda não tem estoque baixado na Olist.')

  await agendarEnvioEstoqueOlist()
  revalidatePath(`/pre-vendas/${preVendaId}`)
  revalidatePath('/configuracoes', 'layout')
  return sucesso(
    `${unidades} unidade(s) voltando para o estoque da Olist (${resultado.pedidos ?? 0} pedido(s)). Lá fica registrado como devolução manual.`,
  )
}

/** Lançamento travado: tentar de novo ou marcar como resolvido à mão na Olist (só admin). */
export async function resolverLancamentoOlist(id: number, acao: 'reenviar' | 'ignorar'): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('resolver_movimento_olist', { p_id: id, p_acao: acao })
  if (error) return falha(traduzirErro(error))
  if (acao === 'reenviar') await agendarEnvioEstoqueOlist()
  revalidatePath('/configuracoes', 'layout')
  return sucesso(acao === 'reenviar' ? 'Lançamento de volta na fila: vai para a Olist em instantes.' : 'Marcado como resolvido na Olist.')
}

/** Envia agora o que estiver na fila de estoque (botão da tela de Integrações). */
export async function enviarEstoqueOlistAgora(): Promise<EstadoAcao> {
  await exigirEquipe()
  const resposta = await pedirARotinaEstoque({ acao: 'processar' })
  revalidatePath('/configuracoes', 'layout')
  if (!resposta.ok) return falha('mensagem' in resposta ? resposta.mensagem : 'Não foi possível enviar a fila de estoque.')
  return sucesso('mensagem' in resposta ? resposta.mensagem : 'Fila de estoque enviada.')
}
