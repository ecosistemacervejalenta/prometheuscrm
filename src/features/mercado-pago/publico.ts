'use server'

import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
import { urlDaRequisicao } from '@/lib/url'

import { conferirPixDoPedido, obterPixDoPedido, type SituacaoPix } from './cobranca'

/**
 * Ações do PIX no link PÚBLICO (sem login): o pedido é identificado pelo id (UUID),
 * que só o cliente recebe — o número #PRM é sequencial e não serve de chave.
 */

const idPedido = z.uuid()

export async function pixDoPedido(pedidoId: string): Promise<SituacaoPix> {
  const id = idPedido.safeParse(pedidoId)
  if (!id.success) return { situacao: 'erro', mensagem: 'Pedido inválido.' }
  return obterPixDoPedido(createAdminClient(), id.data, await urlDaRequisicao())
}

export async function conferirPagamentoPix(pedidoId: string): Promise<'pago' | 'pendente' | 'aguardando_frete' | 'expirado'> {
  const id = idPedido.safeParse(pedidoId)
  if (!id.success) return 'expirado'
  return conferirPixDoPedido(createAdminClient(), id.data)
}
