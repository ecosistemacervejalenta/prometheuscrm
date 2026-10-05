import type { Metadata } from 'next'

import { sair } from '@/features/auth/actions'
import { FormularioNovaSenha } from '@/features/auth/components/formularios-acesso'
import { TelaAcesso } from '@/features/auth/components/tela-acesso'
import { obterSessao } from '@/lib/auth'

export const metadata: Metadata = { title: 'Definir senha' }

export default async function PaginaRedefinirSenha() {
  const sessao = await obterSessao()
  const primeiroAcesso = Boolean(sessao?.perfil?.trocar_senha)

  if (primeiroAcesso) {
    return (
      <TelaAcesso
        titulo="Crie sua senha"
        descricao="Você entrou com uma senha temporária. Crie a sua senha pessoal para começar a usar o CRM."
      >
        <FormularioNovaSenha />
        <form action={sair} className="mt-4 text-center text-sm">
          <button type="submit" className="font-semibold text-volt-700 hover:text-ink">
            Sair
          </button>
        </form>
      </TelaAcesso>
    )
  }

  return (
    <TelaAcesso titulo="Defina sua senha" descricao="Crie a senha que você usará para entrar no CRM.">
      <FormularioNovaSenha />
    </TelaAcesso>
  )
}
