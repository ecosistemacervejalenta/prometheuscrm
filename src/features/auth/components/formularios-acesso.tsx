'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { Alert } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

import { definirSenha, entrar, solicitarRecuperacao } from '../actions'

export function FormularioLogin({ voltar }: { voltar?: string }) {
  return (
    <ActionForm action={entrar} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar ?? '/'} />
      <Field label="E-mail" name="email">
        <Input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" autoFocus />
      </Field>
      <Field label="Senha" name="senha">
        <Input name="senha" type="password" autoComplete="current-password" placeholder="••••••••" />
      </Field>
      <SubmitButton bloco tamanho="lg">
        Entrar
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/login?recuperar=1" className="font-semibold text-volt-700 hover:text-ink">
          Esqueci minha senha
        </Link>
      </p>
    </ActionForm>
  )
}

export function FormularioRecuperacao() {
  return (
    <ActionForm action={solicitarRecuperacao} className="space-y-4" limparAoConcluir>
      <Field label="E-mail" name="email">
        <Input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" autoFocus />
      </Field>
      <SubmitButton bloco tamanho="lg">
        Enviar link
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-volt-700 hover:text-ink">
          Voltar para o login
        </Link>
      </p>
    </ActionForm>
  )
}

/**
 * Definição de senha (convite ou recuperação).
 * Também aceita links antigos que trazem a sessão no fragmento da URL (#access_token=...).
 */
export function FormularioNovaSenha() {
  const [pronto, setPronto] = useState(false)
  const [semSessao, setSemSessao] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const fragmento = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = fragmento.get('access_token')
    const refreshToken = fragmento.get('refresh_token')

    const verificar = async () => {
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        window.history.replaceState(null, '', window.location.pathname)
      }
      const { data } = await supabase.auth.getClaims()
      setSemSessao(!data?.claims)
      setPronto(true)
    }
    void verificar()
  }, [])

  if (!pronto) return <p className="text-sm text-suave">Validando seu link…</p>

  if (semSessao) {
    return (
      <Alert tom="erro" titulo="Link inválido ou expirado">
        Peça um novo convite ao administrador ou use “Esqueci minha senha” na tela de login.
      </Alert>
    )
  }

  return (
    <ActionForm action={definirSenha} className="space-y-4">
      <Field label="Nova senha" name="senha" dica="Mínimo de 8 caracteres.">
        <Input name="senha" type="password" autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Confirme a senha" name="confirmacao">
        <Input name="confirmacao" type="password" autoComplete="new-password" />
      </Field>
      <SubmitButton bloco tamanho="lg">
        Salvar e entrar
      </SubmitButton>
    </ActionForm>
  )
}
