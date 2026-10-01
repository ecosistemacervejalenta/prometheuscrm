import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { excluirVendedor, salvarVendedor } from '@/features/fornecedores/actions'
import { FormularioVendedor } from '@/features/fornecedores/components/formularios'
import { obterVendedor, opcoesFornecedores } from '@/features/fornecedores/queries'

export const metadata: Metadata = { title: 'Editar vendedor' }

export default async function PaginaEditarVendedor({ params }: PageProps<'/fornecedores/vendedores/[id]/editar'>) {
  const { id } = await params
  const [vendedor, empresas] = await Promise.all([obterVendedor(id), opcoesFornecedores()])
  if (!vendedor) notFound()

  return (
    <>
      <PageHeader
        titulo={vendedor.nome}
        voltar={{ href: '/fornecedores/vendedores', rotulo: 'Vendedores' }}
        acoes={
          <ActionButton
            acao={excluirVendedor.bind(null, id)}
            variante="perigo"
            tamanho="md"
            confirmar={`Excluir o vendedor ${vendedor.nome}?`}
          >
            <Trash2 /> Excluir
          </ActionButton>
        }
      />
      <FormularioVendedor
        acao={salvarVendedor.bind(null, id)}
        vendedor={vendedor}
        empresas={empresas}
        empresasSelecionadas={vendedor.fornecedor_vendedores.map((fv) => fv.fornecedor_id)}
      />
    </>
  )
}
