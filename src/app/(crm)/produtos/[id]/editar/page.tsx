import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { opcoesFornecedores } from '@/features/fornecedores/queries'
import { excluirProduto, salvarProduto } from '@/features/produtos/actions'
import { FormularioProduto } from '@/features/produtos/components/formulario-produto'
import { obterProduto } from '@/features/produtos/queries'

export const metadata: Metadata = { title: 'Editar produto' }

export default async function PaginaEditarProduto({ params }: PageProps<'/produtos/[id]/editar'>) {
  const { id } = await params
  const [produto, fornecedores] = await Promise.all([obterProduto(id), opcoesFornecedores()])
  if (!produto) notFound()

  return (
    <>
      <PageHeader
        titulo={produto.nome}
        voltar={{ href: '/produtos', rotulo: 'Produtos' }}
        acoes={
          <ActionButton acao={excluirProduto.bind(null, id)} variante="perigo" tamanho="md" confirmar={`Excluir ${produto.nome}?`}>
            <Trash2 /> Excluir
          </ActionButton>
        }
      />
      <FormularioProduto acao={salvarProduto.bind(null, id)} produto={produto} fornecedores={fornecedores} />
    </>
  )
}
