'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { traduzirErro } from '@/lib/acoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarWhatsapp, whatsappValido } from '@/lib/whatsapp'

import { agendarProcessamentoDeEventos } from '../../integracoes/eventos'

/**
 * Ações do link PÚBLICO de pré-venda (sem login).
 * Rodam no servidor com a chave secreta e chamam funções do banco que
 * validam tudo (pré-venda ativa, preços, limites, estoque e frete).
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

const esquemaConfirmacao = z.object({
  slug: z.string().min(1),
  whatsapp: z.string().refine(whatsappValido, 'Informe um WhatsApp válido.'),
  itens: z
    .array(z.object({ produto_id: z.uuid(), quantidade: z.number().int().positive().max(999) }))
    .min(1, 'Escolha pelo menos um item.'),
  observacoes: z.string().max(500).optional(),
  armadilha: z.string().max(0, 'Envio inválido.').optional(), // campo invisível anti-robô
  cliente: z.object({
    nome: z.string().trim().min(2, 'Informe seu nome e sobrenome.').max(120),
    cep: z.string().refine((v) => v.replace(/\D/g, '').length === 8, 'Informe o CEP.'),
    logradouro: z.string().trim().min(1, 'Informe a rua.').max(160),
    numero: z.string().trim().min(1, 'Informe o número.').max(20),
    complemento: z.string().trim().max(80).optional(),
    bairro: z.string().trim().min(1, 'Informe o bairro.').max(80),
    cidade: z.string().trim().min(1, 'Informe a cidade.').max(80),
    uf: z.string().trim().length(2, 'Informe a UF.'),
  }),
})

export type ResultadoConfirmacao =
  | { ok: true; numero: number; total: number; subtotal: number; taxaEntrega: number; frete: 'vip' | 'a_cotar' }
  | { ok: false; mensagem: string }

export async function confirmarPedidoPreVenda(entrada: z.input<typeof esquemaConfirmacao>): Promise<ResultadoConfirmacao> {
  const dados = esquemaConfirmacao.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? 'Dados inválidos.' }

  const { slug, whatsapp, itens, observacoes, cliente } = dados.data
  const db = createAdminClient()
  const { data, error } = await db.rpc('registrar_pedido_pre_venda', {
    p_slug: slug,
    p_cliente: { ...cliente, uf: cliente.uf.toUpperCase(), whatsapp: normalizarWhatsapp(whatsapp) },
    p_itens: itens,
    p_atualizar_endereco: true,
    p_observacoes: observacoes?.trim() || undefined,
  })
  if (error) return { ok: false, mensagem: traduzirErro(error) }

  agendarProcessamentoDeEventos()
  revalidatePath(`/p/${slug}`)
  return {
    ok: true,
    numero: data.numero,
    total: Number(data.total),
    subtotal: Number(data.subtotal),
    taxaEntrega: Number(data.taxa_entrega),
    frete: data.frete === 'vip' ? 'vip' : 'a_cotar',
  }
}
