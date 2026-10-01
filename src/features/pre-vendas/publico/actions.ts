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
 * validam tudo (pré-venda ativa, preços, limites, estoque).
 */

export type Identificacao =
  | { encontrado: false }
  | { encontrado: true; primeiro_nome: string; tem_endereco: boolean; endereco_resumo: string | null }

export async function identificarCliente(
  slug: string,
  whatsapp: string,
): Promise<{ ok: true; cliente: Identificacao } | { ok: false; mensagem: string }> {
  if (!whatsappValido(whatsapp)) return { ok: false, mensagem: 'Informe um WhatsApp válido, com DDD.' }

  const db = createAdminClient()
  const { data: preVenda } = await db.from('vw_pre_vendas').select('status_efetivo').eq('slug', slug).maybeSingle()
  if (preVenda?.status_efetivo !== 'ativa') return { ok: false, mensagem: 'Esta pré-venda não está mais disponível.' }

  const { data, error } = await db.rpc('identificar_cliente_pre_venda', { p_whatsapp: whatsapp })
  if (error) return { ok: false, mensagem: 'Não foi possível verificar seu cadastro. Tente novamente.' }
  return { ok: true, cliente: data as Identificacao }
}

const esquemaConfirmacao = z.object({
  slug: z.string().min(1),
  whatsapp: z.string().refine(whatsappValido, 'Informe um WhatsApp válido.'),
  itens: z
    .array(z.object({ produto_id: z.uuid(), quantidade: z.number().int().positive().max(999) }))
    .min(1, 'Escolha pelo menos uma cerveja.'),
  atualizarEndereco: z.boolean(),
  observacoes: z.string().max(500).optional(),
  armadilha: z.string().max(0, 'Envio inválido.').optional(), // campo invisível anti-robô
  cliente: z.object({
    nome: z.string().trim().max(120).optional(),
    email: z.string().trim().max(160).optional(),
    cep: z.string().max(12).optional(),
    logradouro: z.string().trim().max(160).optional(),
    numero: z.string().trim().max(20).optional(),
    complemento: z.string().trim().max(80).optional(),
    bairro: z.string().trim().max(80).optional(),
    cidade: z.string().trim().max(80).optional(),
    uf: z.string().trim().max(2).optional(),
    referencia: z.string().trim().max(160).optional(),
  }),
})

export type ResultadoConfirmacao =
  | { ok: true; numero: number; total: number }
  | { ok: false; mensagem: string }

export async function confirmarPedidoPreVenda(entrada: z.input<typeof esquemaConfirmacao>): Promise<ResultadoConfirmacao> {
  const dados = esquemaConfirmacao.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? 'Dados inválidos.' }

  const { slug, whatsapp, itens, atualizarEndereco, observacoes, cliente } = dados.data
  const email = cliente.email && z.email().safeParse(cliente.email).success ? cliente.email : undefined

  const db = createAdminClient()
  const { data, error } = await db.rpc('registrar_pedido_pre_venda', {
    p_slug: slug,
    p_cliente: { ...cliente, email, whatsapp: normalizarWhatsapp(whatsapp) },
    p_itens: itens,
    p_atualizar_endereco: atualizarEndereco,
    p_observacoes: observacoes?.trim() || undefined,
  })
  if (error) return { ok: false, mensagem: traduzirErro(error) }

  agendarProcessamentoDeEventos()
  revalidatePath(`/p/${slug}`)
  return { ok: true, numero: data.numero, total: Number(data.total) }
}
