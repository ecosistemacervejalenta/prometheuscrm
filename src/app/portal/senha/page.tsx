import type { Metadata } from 'next'

import { sairDoPortal } from '@/features/influenciadores/portal/actions'
import { MarcaDoPortal } from '@/features/influenciadores/portal/components/casca'
import { FormularioSenhaDoPortal } from '@/features/influenciadores/portal/components/formularios'
import { exigirInfluenciador } from '@/features/influenciadores/portal/sessao'

export const metadata: Metadata = { title: { absolute: 'Crie sua senha · Portal de parceiros' } }

/** Primeiro acesso: quem entrou com a senha temporária cria a própria senha antes de ver o Portal. */
export default async function PaginaSenhaDoPortal() {
  const { influenciador } = await exigirInfluenciador({ criandoSenha: true })
  const primeiroNome = influenciador.nome.trim().split(/\s+/)[0]

  return (
    <main className="flex min-h-screen items-center justify-center px-5 pt-[max(48px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <MarcaDoPortal loja={influenciador.loja_nome} clara />
        </div>
        <h1 className="tipo-h2">{influenciador.trocar_senha ? `Bem-vindo, ${primeiroNome}!` : 'Trocar senha'}</h1>
        <p className="mt-2 text-suave">
          {influenciador.trocar_senha
            ? 'Você entrou com uma senha temporária. Crie a sua senha pessoal para abrir o Portal.'
            : 'Escolha a nova senha de acesso ao Portal.'}
        </p>
        <div className="mt-8">
          <FormularioSenhaDoPortal primeiroAcesso />
        </div>
        <form action={sairDoPortal} className="mt-4 text-center text-sm">
          <button type="submit" className="font-semibold text-volt-700 hover:text-ink">
            Sair
          </button>
        </form>
      </div>
    </main>
  )
}
