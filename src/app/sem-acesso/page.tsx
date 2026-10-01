import type { Metadata } from 'next'

import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { sair } from '@/features/auth/actions'
import { TelaAcesso } from '@/features/auth/components/tela-acesso'

export const metadata: Metadata = { title: 'Acesso pendente' }

export default function PaginaSemAcesso() {
  return (
    <TelaAcesso titulo="Acesso pendente">
      <Alert tom="alerta" titulo="Sua conta ainda não foi liberada">
        Peça para um administrador ativar seu acesso em Configurações › Equipe.
      </Alert>
      <form action={sair} className="mt-6">
        <Button type="submit" bloco tamanho="lg" variante="escuro">
          Sair
        </Button>
      </form>
    </TelaAcesso>
  )
}
