'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errosDeValidacao, falha, sucesso, type EstadoAcao } from '@/lib/acoes'
import { createClient } from '@/lib/supabase/server'
import { urlDoSite } from '@/lib/url'

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

export async function solicitarRecuperacao(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const email = z.email('Informe um e-mail válido.').safeParse(formData.get('email'))
  if (!email.success) return { ok: false, erros: { email: ['Informe um e-mail válido.'] } }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await urlDoSite()}/auth/confirm?next=/redefinir-senha`,
  })
  // Mesma resposta exista ou não a conta (não revela e-mails cadastrados).
  return sucesso('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.')
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
  const { error } = await supabase.auth.updateUser({ password: dados.data.senha })
  if (error) return falha('O link expirou ou é inválido. Peça um novo link de acesso.')

  redirect('/')
}
