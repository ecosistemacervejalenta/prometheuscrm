'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { createClient } from '@/lib/supabase/server'
import { formParaObjeto } from '@/lib/validacao'
import type { Json } from '@/types'

import { esquemaContaPortal, esquemaSenhaPortal } from '../schema'
import { exigirInfluenciador } from './sessao'

/** Ações do Portal do influenciador. Tudo passa pelas funções portal_*() do banco, presas a quem está logado. */

const esquemaLogin = z.object({
  email: z.email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

export async function entrarNoPortal(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = esquemaLogin.safeParse({ email: formData.get('email'), senha: formData.get('senha') })
  if (!dados.success) return errosDeValidacao(dados.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email.trim().toLowerCase(), password: dados.data.senha })
  if (error) return falha('E-mail ou senha incorretos.')

  await supabase.rpc('portal_registrar_acesso')
  // Quem não é influenciador (equipe) é mandado para o CRM pela própria página.
  redirect('/portal')
}

export async function sairDoPortal() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/portal/entrar')
}

/** Cria a senha pessoal (primeiro acesso com senha temporária) ou troca a atual. */
export async function definirSenhaDoPortal(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase, influenciador } = await exigirInfluenciador({ criandoSenha: true })
  const dados = esquemaSenhaPortal.safeParse({ senha: formData.get('senha'), confirmacao: formData.get('confirmacao') })
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.auth.updateUser({ password: dados.data.senha })
  if (error) {
    if (error.code === 'same_password') return falha('A nova senha precisa ser diferente da atual.')
    if (error.code === 'weak_password') return falha('Senha fraca: escolha uma senha mais forte.')
    return falha('Sua sessão expirou. Entre de novo e tente outra vez.')
  }

  const { error: erroFlag } = await supabase.rpc('portal_senha_definida')
  if (erroFlag) return falha('Senha salva, mas não foi possível liberar o acesso. Tente novamente.')

  if (influenciador.trocar_senha) redirect('/portal')
  return sucesso('Senha alterada.')
}

/** Minha conta: contato e PIX (cupom, comissão e status são da loja). */
export async function salvarContaDoPortal(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirInfluenciador()
  const dados = esquemaContaPortal.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.rpc('portal_atualizar_dados', { p_dados: dados.data as unknown as Json })
  if (error) return falha(traduzirErro(error))

  revalidatePath('/portal', 'layout')
  return sucesso('Dados salvos.')
}
