'use server'

import { revalidatePath } from 'next/cache'

import { falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formatarNumero } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'

import { desdeDoPeriodo, diasSemCompra, esquemaLista, esquemaTipo } from './schema'
import { lerComprasDaLoja } from './sincronizacao'

/** Clientes › Por estilo: ler a loja agora, gravar o público como lista e organizar as collections. */

function atualizarTelas() {
  revalidatePath('/clientes', 'layout')
}

const plural = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`

/** Botão "Atualizar agora": lê a loja na hora (pedidos novos, collections e produtos). */
export async function atualizarComprasDaLoja(): Promise<EstadoAcao> {
  await exigirEquipe()
  // Chave secreta só para a leitura: as credenciais da Shopify ficam no Vault e a gravação é da rotina.
  const r = await lerComprasDaLoja(createAdminClient(), { conferirPermissao: true, colecoesAgora: true })
  atualizarTelas()
  if (!r.ok) return falha(r.mensagem)

  const partes = [
    r.pedidos === 0 ? 'Nenhum pedido novo ou alterado' : `${plural(r.pedidos, 'pedido lido', 'pedidos lidos')} (${plural(r.novos, 'novo', 'novos')})`,
  ]
  if (r.clientesNovos > 0) partes.push(plural(r.clientesNovos, 'cliente novo', 'clientes novos'))
  if (r.produtos > 0) partes.push(plural(r.produtos, 'produto conferido', 'produtos conferidos'))
  const final = r.incompleta ? ' Ainda falta uma parte: clique de novo em instantes.' : ''
  return sucesso(`${partes.join(' · ')}.${final}`)
}

export type ResultadoLista = { ok: true; mensagem: string; listaId: string; total: number } | { ok: false; mensagem: string }

/** "Criar lista para campanha": grava o público no Banco de Leads (pasta "Clientes da loja"). */
export async function criarListaDoPublico(entrada: unknown): Promise<ResultadoLista> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaLista.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? 'Revise a lista.' }

  const { nome, colecoes, periodo, semCompra } = dados.data
  const desde = desdeDoPeriodo(periodo)
  const dias = diasSemCompra(semCompra)
  const { data, error } = await supabase.rpc('criar_lista_de_colecoes', {
    p_nome: nome,
    p_colecoes: colecoes,
    ...(desde ? { p_desde: desde } : {}),
    ...(dias ? { p_sem_compra_dias: dias } : {}),
  })
  if (error) return { ok: false, mensagem: traduzirErro(error) }

  const r = data as { lista_id: string; nome: string; total: number }
  revalidatePath('/leads', 'layout')
  revalidatePath('/campanhas/nova')
  if (r.total === 0) {
    return { ok: true, listaId: r.lista_id, total: 0, mensagem: `Lista "${r.nome}" criada, mas vazia: ninguém deste público recebe campanha (sem WhatsApp ou descadastrado).` }
  }
  return { ok: true, listaId: r.lista_id, total: r.total, mensagem: `Lista "${r.nome}" criada com ${plural(r.total, 'contato', 'contatos')} no Banco de Leads.` }
}

/** Troca o tipo de uma collection (estilo, cervejaria, tema, ignorar). A leitura da loja não desfaz. */
export async function classificarColecao(id: string, tipo: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaTipo.safeParse({ id, tipo })
  if (!dados.success) return falha('Tipo inválido.')

  const { error } = await supabase.from('shopify_colecoes').update({ tipo: dados.data.tipo, tipo_manual: true }).eq('id', dados.data.id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso()
}
