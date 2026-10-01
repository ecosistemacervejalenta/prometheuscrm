import type { Metadata } from 'next'

import { Alert } from '@/components/ui/alert'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'
import { FormularioLoja } from '@/features/configuracoes/components/formularios'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Configurações' }

export default async function PaginaConfiguracoes({ searchParams }: PageProps<'/configuracoes'>) {
  const erro = param((await searchParams).erro)
  const config = await obterConfiguracoes()

  return (
    <>
      <CabecalhoConfiguracoes ativa="loja" />
      {erro === 'apenas-admin' && (
        <Alert tom="alerta" className="mb-6">
          Esta área é exclusiva de administradores.
        </Alert>
      )}
      <FormularioLoja config={config} />
    </>
  )
}
