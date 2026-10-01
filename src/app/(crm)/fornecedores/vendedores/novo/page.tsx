import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { salvarVendedor } from '@/features/fornecedores/actions'
import { FormularioVendedor } from '@/features/fornecedores/components/formularios'
import { opcoesFornecedores } from '@/features/fornecedores/queries'

export const metadata: Metadata = { title: 'Novo vendedor' }

export default async function PaginaNovoVendedor() {
  const empresas = await opcoesFornecedores()
  return (
    <>
      <PageHeader titulo="Novo vendedor" voltar={{ href: '/fornecedores/vendedores', rotulo: 'Vendedores' }} />
      <FormularioVendedor acao={salvarVendedor.bind(null, null)} empresas={empresas} />
    </>
  )
}
