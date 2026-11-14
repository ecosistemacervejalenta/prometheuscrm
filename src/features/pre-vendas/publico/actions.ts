'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { traduzirErro } from '@/lib/acoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarWhatsapp, whatsappValido } from '@/lib/whatsapp'

import { agendarProcessamentoDeEventos } from '../../integracoes/eventos'
import { agendarFilaEstoqueOlist } from '../../olist/estoque'
import { lerCaixa, type CaixaPublica } from './caixa-dados'

/**
 * Ações do link PÚBLICO de pré-venda (sem login).
 * Rodam no servidor com a chave secreta e chamam funções do banco que
 * validam tudo (pré-venda ativa, preços, limites, estoque, frete e a Caixa VIP).
 */

/** O CEP tem frete fixo (lista de CEPs VIP)? Só responde para pré-vendas ativas. */
export async function consultarFreteLink(
  slug: string,
  cep: string,
): Promise<{ ok: true; vip: boolean } | { ok: false; mensagem: string }> {
  const digitos = cep.replace(/\D/g, '')
  if (digitos.length !== 8) return { ok: false, mensagem: 'CEP inválido.' }

  const db = createAdminClient()
  const { data: preVenda } = await db.from('vw_pre_vendas').select('status_efetivo').eq('slug', slug).maybeSingle()
  if (preVenda?.status_efetivo !== 'ativa') return { ok: false, mensagem: 'Esta pré-venda não está mais disponível.' }

  const { data, error } = await db.rpc('cep_tem_frete_vip', { p_cep: digitos })
  if (error) return { ok: false, mensagem: 'Não foi possível consultar o frete.' }
  return { ok: true, vip: Boolean(data) }
}

const emailDoLink = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.email('Confira o seu e-mail.').max(120))

const esquemaConfirmacao = z.object({
  slug: z.string().min(1),
  whatsapp: z.string().refine(whatsappValido, 'Informe um WhatsApp válido.'),
  itens: z
    .array(z.object({ produto_id: z.uuid(), quantidade: z.number().int().positive().max(999) }))
    .min(1, 'Escolha pelo menos um item.'),
  observacoes: z.string().max(500).optional(),
  armadilha: z.string().max(0, 'Envio inválido.').optional(), // campo invisível anti-robô
  /** Obrigatório para cliente novo; quem já tem caixa pode não informar (vale o e-mail do cadastro). */
  email: emailDoLink.optional(),
  /**
   * Nome e endereço digitados agora. Sem eles, vale o cadastro do WhatsApp — é o caso de quem
   * já tem uma Caixa VIP aberta e compra de outro aparelho (o endereço da caixa não é exibido).
   */
  cliente: z
    .object({
      nome: z.string().trim().min(2, 'Informe seu nome e sobrenome.').max(120),
      cep: z.string().refine((v) => v.replace(/\D/g, '').length === 8, 'Informe o CEP.'),
      logradouro: z.string().trim().min(1, 'Informe a rua.').max(160),
      numero: z.string().trim().min(1, 'Informe o número.').max(20),
      complemento: z.string().trim().max(80).optional(),
      bairro: z.string().trim().min(1, 'Informe o bairro.').max(80),
      cidade: z.string().trim().min(1, 'Informe a cidade.').max(80),
      uf: z.string().trim().length(2, 'Informe a UF.'),
    })
    .optional(),
})

export type ResultadoConfirmacao =
  | { ok: true; pedidoId: string; numero: number; total: number; subtotal: number; taxaEntrega: number; frete: 'vip' | 'a_cotar'; caixa: CaixaPublica | null }
  | { ok: false; mensagem: string }

export async function confirmarPedidoPreVenda(entrada: z.input<typeof esquemaConfirmacao>): Promise<ResultadoConfirmacao> {
  const dados = esquemaConfirmacao.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? 'Dados inválidos.' }

  const { slug, whatsapp, itens, observacoes, cliente, email } = dados.data
  if (cliente && !email) return { ok: false, mensagem: 'Informe o seu e-mail.' }

  const db = createAdminClient()
  const { data, error } = await db.rpc('registrar_pedido_pre_venda', {
    p_slug: slug,
    p_cliente: { ...cliente, ...(cliente ? { uf: cliente.uf.toUpperCase() } : {}), email, whatsapp: normalizarWhatsapp(whatsapp) },
    p_itens: itens,
    p_atualizar_endereco: Boolean(cliente),
    p_observacoes: observacoes?.trim() || undefined,
  })
  if (error) return { ok: false, mensagem: traduzirErro(error) }

  // E-mail no cadastro: o Mercado Pago usa no PIX (preparar_cobranca_pix lê clientes.email).
  if (email) {
    const { error: erroEmail } = await db.from('clientes').update({ email }).eq('id', data.cliente_id)
    if (erroEmail) console.error('[pre-venda] e-mail do cliente', erroEmail.message)
  }

  const { data: caixa } = await db.rpc('caixa_publica', { p_pedido_id: data.id })

  agendarProcessamentoDeEventos()
  agendarFilaEstoqueOlist() // a compra já baixou na cópia local; aqui vai para a Olist
  revalidatePath(`/p/${slug}`)
  return {
    ok: true,
    pedidoId: data.id,
    numero: data.numero,
    total: Number(data.total),
    subtotal: Number(data.subtotal),
    taxaEntrega: Number(data.taxa_entrega),
    frete: data.frete === 'vip' ? 'vip' : 'a_cotar',
    caixa: lerCaixa(caixa),
  }
}

// -----------------------------------------------------------------------------
// Caixa VIP
// -----------------------------------------------------------------------------

export type ResultadoIdentificacao =
  | { ok: true; cliente: boolean; temEndereco: boolean; caixa: CaixaPublica | null }
  | { ok: false; mensagem: string }

/**
 * O cliente digitou o WhatsApp: ele já tem uma Caixa VIP em andamento?
 * Devolve só o primeiro nome, as cervejas e os valores da caixa — nunca o endereço completo.
 */
export async function identificarCaixa(slug: string, whatsapp: string): Promise<ResultadoIdentificacao> {
  if (!whatsappValido(whatsapp)) return { ok: false, mensagem: 'Confira o número: DDD + celular.' }
  const db = createAdminClient()
  const { data: preVenda } = await db.from('vw_pre_vendas').select('status_efetivo').eq('slug', slug).maybeSingle()
  if (preVenda?.status_efetivo !== 'ativa') return { ok: false, mensagem: 'Esta pré-venda não está mais disponível.' }

  const { data, error } = await db.rpc('caixa_do_whatsapp', { p_whatsapp: normalizarWhatsapp(whatsapp) ?? '' })
  if (error) {
    console.error('[pre-venda] identificar caixa', error.message)
    return { ok: true, cliente: false, temEndereco: false, caixa: null }
  }
  const r = (data ?? {}) as { cliente?: boolean; tem_endereco?: boolean; caixa?: unknown }
  return { ok: true, cliente: r.cliente === true, temEndereco: r.tem_endereco === true, caixa: lerCaixa(r.caixa) }
}

const idPedido = z.uuid()

/** Caixa atual (tela final do link e /pagar). O pedido é identificado pelo UUID, que só o cliente tem. */
export async function minhaCaixa(pedidoId: string): Promise<CaixaPublica | null> {
  const id = idPedido.safeParse(pedidoId)
  if (!id.success) return null
  const { data } = await createAdminClient().rpc('caixa_publica', { p_pedido_id: id.data })
  return lerCaixa(data)
}

/** O cliente escolheu "fechar a caixa e pagar agora". */
export async function fecharMinhaCaixa(pedidoId: string): Promise<CaixaPublica | null> {
  const id = idPedido.safeParse(pedidoId)
  if (!id.success) return null
  const db = createAdminClient()
  const { error } = await db.rpc('fechar_caixa', { p_pedido_id: id.data })
  if (error) console.error('[pre-venda] fechar caixa', error.message)
  const { data } = await db.rpc('caixa_publica', { p_pedido_id: id.data })
  return lerCaixa(data)
}
