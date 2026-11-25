import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

import type { TipoChavePix } from '../rotulos'

/**
 * Sessão do Portal do influenciador.
 * O influenciador é um login de FORA da equipe: não tem perfil, então o RLS do CRM inteiro
 * continua fechado para ele. Tudo o que o Portal mostra vem das funções portal_*() do banco,
 * que só devolvem os dados de quem está logado.
 */

export type InfluenciadorDoPortal = {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  instagram: string | null
  documento: string | null
  cupom: string
  cupom_ativo: boolean
  desconto_percentual: number
  comissao_percentual: number
  status: 'ativo' | 'pausado' | 'encerrado'
  trocar_senha: boolean
  tipo_chave_pix: TipoChavePix | null
  chave_pix: string | null
  nome_recebedor: string | null
  criado_em: string
  loja_nome: string
  loja_url: string | null
  carencia_dias: number
  regras: string | null
}

/** Quem está logado e o cadastro de influenciador dele (memoizado por requisição). null = sem sessão. */
export const obterInfluenciadorLogado = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) return null

  const { data: cadastro } = await supabase.rpc('portal_influenciador')
  return { supabase, influenciador: (cadastro as InfluenciadorDoPortal | null) ?? null }
})

/**
 * Garante um influenciador logado. Use no início de toda página e Server Action do Portal.
 * Quem entrou com senha temporária só passa depois de criar a própria senha.
 */
export async function exigirInfluenciador({ criandoSenha = false } = {}) {
  const sessao = await obterInfluenciadorLogado()
  if (!sessao) redirect('/portal/entrar')
  // Logado, mas não é influenciador (alguém da equipe): o CRM decide para onde vai.
  if (!sessao.influenciador) redirect('/')
  if (sessao.influenciador.trocar_senha && !criandoSenha) redirect('/portal/senha')
  return { supabase: sessao.supabase, influenciador: sessao.influenciador }
}
