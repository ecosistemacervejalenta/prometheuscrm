import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { erroJson, verificarChave } from '@/features/integracoes/api-auth'
import { agendarProcessamentoDeEventos } from '@/features/integracoes/eventos'
import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'
import { termoBusca } from '@/lib/utils'
import { normalizarWhatsapp, whatsappValido } from '@/lib/whatsapp'

/** GET /api/v1/clientes?whatsapp=&email=&q=&limite= */
export async function GET(request: NextRequest) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  const p = request.nextUrl.searchParams
  const limite = Math.min(Number(p.get('limite') ?? 50) || 50, 200)
  let consulta = createAdminClient().from('vw_clientes').select('*').order('nome').limit(limite)

  const whatsapp = normalizarWhatsapp(p.get('whatsapp'))
  if (whatsapp) consulta = consulta.eq('whatsapp', whatsapp)
  if (p.get('email')) consulta = consulta.eq('email', p.get('email')!.toLowerCase())
  if (p.get('q')) consulta = consulta.ilike('nome', `%${termoBusca(p.get('q')!)}%`)
  if (p.get('vip') === 'true') consulta = consulta.eq('vip', true)

  const { data, error } = await consulta
  if (error) return erroJson(error.message, 500)
  return NextResponse.json({ dados: data })
}

const esquemaCliente = z.object({
  nome: z.string().trim().min(1),
  whatsapp: z.string().refine(whatsappValido, 'WhatsApp inválido'),
  email: z.email().optional(),
  vip: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  observacoes: z.string().optional(),
  app_usuario_id: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().length(2).optional(),
})

/** POST /api/v1/clientes — cria ou atualiza (pelo WhatsApp). */
export async function POST(request: NextRequest) {
  const negado = verificarChave(request, envServidor.apiKey, 'INTEGRATIONS_API_KEY')
  if (negado) return negado

  const dados = esquemaCliente.safeParse(await request.json().catch(() => null))
  if (!dados.success) return erroJson(dados.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 422)

  const db = createAdminClient()
  const whatsapp = normalizarWhatsapp(dados.data.whatsapp)!
  const { data: existente } = await db.from('clientes').select('id').eq('whatsapp', whatsapp).maybeSingle()

  const campos = { ...dados.data, whatsapp, uf: dados.data.uf?.toUpperCase() }
  const { data, error } = existente
    ? await db.from('clientes').update(campos).eq('id', existente.id).select().single()
    : await db.from('clientes').insert({ ...campos, origem: dados.data.app_usuario_id ? 'app' : 'importacao' }).select().single()

  if (error) return erroJson(error.message, 400)
  agendarProcessamentoDeEventos()
  return NextResponse.json({ dados: data, criado: !existente }, { status: existente ? 200 : 201 })
}
