import { NextResponse, type NextRequest } from 'next/server'

import { erroJson, verificarChave } from '@/features/integracoes/api-auth'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CANAIS, STATUS_PAGAMENTO } from '@/lib/rotulos'
import type { CanalVenda, StatusPagamento } from '@/types'

/** GET /api/v1/pedidos?status_pagamento=&canal=&pre_venda=&desde=&limite= */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  const p = request.nextUrl.searchParams
  const limite = Math.min(Number(p.get('limite') ?? 50) || 50, 200)
  let consulta = createAdminClient()
    .from('pedidos')
    .select('*, clientes(id, nome, whatsapp, email, vip), pre_vendas(id, titulo, slug), pedido_itens(produto_id, descricao, quantidade, preco_unitario, total)')
    .order('criado_em', { ascending: false })
    .limit(limite)

  const status = p.get('status_pagamento')
  if (status && status in STATUS_PAGAMENTO) consulta = consulta.eq('status_pagamento', status as StatusPagamento)
  const canal = p.get('canal')
  if (canal && canal in CANAIS) consulta = consulta.eq('canal', canal as CanalVenda)
  if (p.get('pre_venda')) consulta = consulta.eq('pre_venda_id', p.get('pre_venda')!)
  if (p.get('desde')) consulta = consulta.gte('criado_em', p.get('desde')!)

  const { data, error } = await consulta
  if (error) return erroJson(error.message, 500)
  return NextResponse.json({ dados: data })
}
