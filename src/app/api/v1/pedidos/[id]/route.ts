import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { erroJson, verificarChave } from '@/features/integracoes/api-auth'
import { agendarProcessamentoDeEventos } from '@/features/integracoes/eventos'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/v1/pedidos/{id} — pedido completo (cliente, itens, endereço). */
export async function GET(request: NextRequest, contexto: RouteContext<'/api/v1/pedidos/[id]'>) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  const { id } = await contexto.params
  if (!z.uuid().safeParse(id).success) return erroJson('ID inválido.', 400)

  const { data, error } = await createAdminClient().rpc('pedido_json', { p_pedido_id: id })
  if (error) return erroJson(error.message, 500)
  if (!data) return erroJson('Pedido não encontrado.', 404)
  return NextResponse.json({ dados: data })
}

const esquemaAtualizacao = z
  .object({
    status: z.enum(['novo', 'confirmado', 'separado', 'entregue', 'cancelado']).optional(),
    status_pagamento: z.enum(['pendente', 'cobrado', 'pago', 'estornado']).optional(),
    forma_pagamento: z.string().max(60).optional(),
    observacoes: z.string().max(1000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Envie pelo menos um campo.')

/** PATCH /api/v1/pedidos/{id} — ex.: { "status_pagamento": "pago", "forma_pagamento": "PIX" } */
export async function PATCH(request: NextRequest, contexto: RouteContext<'/api/v1/pedidos/[id]'>) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  const { id } = await contexto.params
  const dados = esquemaAtualizacao.safeParse(await request.json().catch(() => null))
  if (!dados.success) return erroJson(dados.error.issues[0]?.message ?? 'Dados inválidos.', 422)

  const db = createAdminClient()
  const { data, error } = await db.from('pedidos').update(dados.data).eq('id', id).select('id').maybeSingle()
  if (error) return erroJson(error.message, 400)
  if (!data) return erroJson('Pedido não encontrado.', 404)

  agendarProcessamentoDeEventos()
  const { data: pedido } = await db.rpc('pedido_json', { p_pedido_id: id })
  return NextResponse.json({ dados: pedido })
}
