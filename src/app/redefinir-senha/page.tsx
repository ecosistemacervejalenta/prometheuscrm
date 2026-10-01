import type { Metadata } from 'next'

import { FormularioNovaSenha } from '@/features/auth/components/formularios-acesso'
import { TelaAcesso } from '@/features/auth/components/tela-acesso'

export const metadata: Metadata = { title: 'Definir senha' }

export default function PaginaRedefinirSenha() {
  return (
    <TelaAcesso titulo="Defina sua senha" descricao="Crie a senha que você usará para entrar no CRM.">
      <FormularioNovaSenha />
    </TelaAcesso>
  )
}
