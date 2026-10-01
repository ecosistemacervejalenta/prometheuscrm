import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { opcoesFornecedores } from '@/features/fornecedores/queries'
import { salvarProduto } from '@/features/produtos/actions'
import { FormularioProduto } from '@/features/produtos/components/formulario-produto'

export const metadata: Metadata = { title: 'Novo produto' }

export default async function PaginaNovoProduto() {
  const fornecedores = await opcoesFornecedores()
  return (
    <>
      <PageHeader titulo="Novo produto" voltar={{ href: '/produtos', rotulo: 'Produtos' }} />
      <FormularioProduto acao={salvarProduto.bind(null, null)} fornecedores={fornecedores} />
    </>
  )
}
