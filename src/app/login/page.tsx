import type { Metadata } from 'next'

import { Alert } from '@/components/ui/alert'
import { FormularioLogin } from '@/features/auth/components/formularios-acesso'
import { TelaAcesso } from '@/features/auth/components/tela-acesso'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Entrar' }

const ERROS: Record<string, string> = {
  'link-invalido': 'O link de acesso é inválido ou expirou. Peça ao administrador uma nova senha temporária.',
}

export default async function PaginaLogin({ searchParams }: PageProps<'/login'>) {
  const busca = await searchParams
  const erro = ERROS[param(busca.erro) ?? '']

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
