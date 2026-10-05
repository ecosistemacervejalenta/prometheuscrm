import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { excluirFornecedor, salvarFornecedor } from '@/features/fornecedores/actions'
import { ContasDoFornecedor } from '@/features/fornecedores/components/contas-do-fornecedor'
import { FormularioFornecedor } from '@/features/fornecedores/components/formularios'
import { obterFornecedor } from '@/features/fornecedores/queries'

export const metadata: Metadata = { title: 'Editar empresa' }

export default async function PaginaEditarFornecedor({ params }: PageProps<'/fornecedores/[id]/editar'>) {
  const { id } = await params
  const fornecedor = await obterFornecedor(id)
  if (!fornecedor) notFound()

  const vendedores = fornecedor.fornecedor_vendedores.map((fv) => fv.vendedores?.nome).filter(Boolean)

  return (
    <>
      <PageHeader
        titulo={fornecedor.nome}
        voltar={{ href: '/fornecedores', rotulo: 'Fornecedores' }}
        descricao={vendedores.length > 0 ? `Atendida por: ${vendedores.join(', ')}` : 'Nenhum vendedor vinculado.'}
        acoes={
          <ActionButton
            acao={excluirFornecedor.bind(null, id)}
            variante="perigo"
            tamanho="md"
            confirmar={`Excluir ${fornecedor.nome}? Contas e produtos vinculados ficarão sem fornecedor.`}
          >
            <Trash2 /> Excluir
          </ActionButton>
        }
      />
      <div className="space-y-6">
        <FormularioFornecedor acao={salvarFornecedor.bind(null, id)} fornecedor={fornecedor} />
        <ContasDoFornecedor fornecedorId={id} />
      </div>
    </>
  )
}
