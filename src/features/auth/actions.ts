'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errosDeValidacao, falha, type EstadoAcao } from '@/lib/acoes'
import { createClient } from '@/lib/supabase/server'

/** Aceita apenas caminhos internos (evita redirecionamento aberto). */
function destinoSeguro(caminho: unknown): string {
  return typeof caminho === 'string' && caminho.startsWith('/') && !caminho.startsWith('//') ? caminho : '/'
}

const esquemaLogin = z.object({
  email: z.email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

export async function entrar(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = esquemaLogin.safeParse({ email: formData.get('email'), senha: formData.get('senha') })
  if (!dados.success) return errosDeValidacao(dados.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  })
  if (error) return falha('E-mail ou senha incorretos.')

  redirect(destinoSeguro(formData.get('voltar')))
}

export async function sair() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

const esquemaSenha = z
  .object({
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, { message: 'As senhas não conferem.', path: ['confirmacao'] })

export async function definirSenha(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = esquemaSenha.safeParse({ senha: formData.get('senha'), confirmacao: formData.get('confirmacao') })
  if (!dados.success) return errosDeValidacao(dados.error)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.updateUser({ password: dados.data.senha })
  if (error) {
    if (error.code === 'same_password') return falha('A nova senha precisa ser diferente da senha temporária.')
    if (error.code === 'weak_password') return falha('Senha fraca: escolha uma senha mais forte.')
    return falha('Sua sessão expirou. Entre de novo com a senha temporária ou peça uma nova ao administrador.')
  }

  // Senha própria criada: libera o CRM para quem entrou com senha temporária.
  const { error: erroPerfil } = await supabase.from('perfis').update({ trocar_senha: false }).eq('id', data.user.id)
  if (erroPerfil) return falha('Senha salva, mas não foi possível liberar o acesso. Tente novamente.')

  redirect('/')
}
