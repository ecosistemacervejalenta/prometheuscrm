import type { Metadata } from 'next'

import { Alert } from '@/components/ui/alert'
import { FormularioLogin, FormularioRecuperacao } from '@/features/auth/components/formularios-acesso'
import { TelaAcesso } from '@/features/auth/components/tela-acesso'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Entrar' }

const ERROS: Record<string, string> = {
  'link-invalido': 'O link de acesso é inválido ou expirou. Solicite um novo.',
}

export default async function PaginaLogin({ searchParams }: PageProps<'/login'>) {
  const busca = await searchParams
  const recuperar = param(busca.recuperar) === '1'
  const erro = ERROS[param(busca.erro) ?? '']

  if (recuperar) {
    return (
      <TelaAcesso titulo="Recuperar senha" descricao="Enviaremos um link para você criar uma nova senha.">
        <FormularioRecuperacao />
      </TelaAcesso>
    )
  }

  return (
    <TelaAcesso titulo="Entrar no CRM" descricao="Acesso exclusivo da equipe Prometheus.">
      {erro && (
        <Alert tom="erro" className="mb-5">
          {erro}
        </Alert>
      )}
      <FormularioLogin voltar={param(busca.voltar)} />
    </TelaAcesso>
  )
}
