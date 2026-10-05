'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { STATUS_PAGAMENTO, STATUS_PEDIDO } from '@/lib/rotulos'
import { dinheiroOpcional, textoOpcional } from '@/lib/validacao'
import type { StatusPagamento, StatusPedido } from '@/types'

import { agendarProcessamentoDeEventos } from '../integracoes/eventos'

function atualizarTelas(id?: string) {
  if (id) revalidatePath(`/pedidos/${id}`)
  revalidatePath('/pedidos')
  revalidatePath('/grupo-vip')
  revalidatePath('/pre-vendas', 'layout')
  revalidatePath('/')
}

const esquemaPedidoManual = z.object({
  cliente_id: z.uuid('Selecione o cliente.'),
  pre_venda_id: z.preprocess((v) => (v ? String(v) : undefined), z.uuid().optional()),
  canal: z.enum(['grupo_vip', 'whatsapp', 'loja', 'shopify', 'app']),
  itens: z.preprocess(
    (v) => {
      try {
        return JSON.parse(String(v ?? '[]'))
      } catch {
        return []
      }
    },
    z
      .array(z.object({ produto_id: z.uuid(), quantidade: z.number().int().positive() }))
      .min(1, 'Adicione pelo menos uma cerveja.'),
  ),
  taxa_entrega: dinheiroOpcional,
  desconto: dinheiroOpcional,
  observacoes: textoOpcional,
})

export async function criarPedidoManual(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaPedidoManual.safeParse(Object.fromEntries(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { data, error } = await supabase.rpc('criar_pedido', {
    p_cliente_id: dados.data.cliente_id,
    p_itens: dados.data.itens,
    p_pre_venda_id: dados.data.pre_venda_id,
    p_canal: dados.data.canal,
    p_origem: 'manual',
    p_observacoes: dados.data.observacoes ?? undefined,
    p_taxa_entrega: dados.data.taxa_entrega,
    p_desconto: dados.data.desconto,
  })
  if (error) return falha(traduzirErro(error))

  agendarProcessamentoDeEventos()
  atualizarTelas()
  redirect(`/pedidos/${data.id}`)
}

/** Registra que a cobrança foi enviada pelo WhatsApp (pendente → cobrado). */
export async function registrarCobranca(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.rpc('registrar_cobranca', { p_pedido_id: id })
  if (error) return falha(traduzirErro(error))
  agendarProcessamentoDeEventos()
  atualizarTelas(id)
  return sucesso('Cobrança registrada.')
}

export async function definirPagamento(id: string, status: StatusPagamento, forma?: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase
    .from('pedidos')
    .update({ status_pagamento: status, ...(forma ? { forma_pagamento: forma } : {}) })
    .eq('id', id)
  if (error) return falha(traduzirErro(error))
  agendarProcessamentoDeEventos()
  atualizarTelas(id)
  return sucesso(`Pagamento: ${STATUS_PAGAMENTO[status].rotulo.toLowerCase()}.`)
}

export async function definirStatusPedido(id: string, status: StatusPedido): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('pedidos').update({ status }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  agendarProcessamentoDeEventos()
  atualizarTelas(id)
  return sucesso(`Pedido marcado como ${STATUS_PEDIDO[status].rotulo.toLowerCase()}.`)
}

/** Valor do frete de um pedido do link com CEP fora da lista VIP (ou correção de frete). */
export async function cotarFrete(id: string, valor: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = dinheiroOpcional.safeParse(valor)
  if (!dados.success || !valor.trim()) return falha('Informe o valor do frete.')
  const { error } = await supabase.rpc('cotar_frete_pedido', { p_pedido_id: id, p_valor: dados.data })
  if (error) return falha(traduzirErro(error))
  atualizarTelas(id)
  return sucesso('Frete salvo. Agora envie o valor ao cliente pelo WhatsApp.')
}

/**
 * Exclui a venda de vez (só administradores): sai do faturamento e dos relatórios.
 * Para manter o histórico, o caminho é marcar como "cancelado".
 */
export async function excluirPedido(id: string, voltarPara: string | null): Promise<EstadoAcao> {
  const { supabase, perfil } = await exigirEquipe()
  if (perfil.papel !== 'admin') return falha('Só administradores podem excluir vendas.')
  const { error } = await supabase.rpc('excluir_pedido', { p_pedido_id: id })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  revalidatePath('/clientes', 'layout')
  if (voltarPara) redirect(voltarPara)
  return sucesso('Venda excluída. Ela saiu do faturamento.')
}
