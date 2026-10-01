import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

/**
 * Usuário logado + perfil da equipe (memoizado por requisição).
 * Retorna null se não houver sessão ou se o perfil estiver inativo.
 */
export const obterSessao = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return null

  const { data: perfil } = await supabase.from('perfis').select('*').eq('id', userId).maybeSingle()
  if (!perfil?.ativo) return { supabase, userId, perfil: null }

  return { supabase, userId, perfil }
})

/**
 * Garante que há um membro ativo da equipe logado.
 * Use no início de toda página e Server Action do CRM.
 */
export async function exigirEquipe() {
  const sessao = await obterSessao()
  if (!sessao) redirect('/login')
  if (!sessao.perfil) redirect('/sem-acesso')
  return { supabase: sessao.supabase, perfil: sessao.perfil }
}

/** Igual a exigirEquipe, mas apenas para administradores. */
export async function exigirAdmin() {
  const sessao = await exigirEquipe()
  if (sessao.perfil.papel !== 'admin') redirect('/configuracoes?erro=apenas-admin')
  return sessao
}
