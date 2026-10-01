import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { salvarFornecedor } from '@/features/fornecedores/actions'
import { FormularioFornecedor } from '@/features/fornecedores/components/formularios'

export const metadata: Metadata = { title: 'Nova empresa' }

export default function PaginaNovoFornecedor() {
  return (
    <>
      <PageHeader titulo="Nova empresa" voltar={{ href: '/fornecedores', rotulo: 'Fornecedores' }} />
      <FormularioFornecedor acao={salvarFornecedor.bind(null, null)} />
    </>
  )
}
