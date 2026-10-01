import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { excluirCliente, salvarCliente } from '@/features/clientes/actions'
import { FormularioCliente } from '@/features/clientes/components/formulario-cliente'
import { obterClienteParaEdicao } from '@/features/clientes/queries'

export const metadata: Metadata = { title: 'Editar cliente' }

export default async function PaginaEditarCliente({ params }: PageProps<'/clientes/[id]/editar'>) {
  const { id } = await params
  const cliente = await obterClienteParaEdicao(id)
  if (!cliente) notFound()

  return (
    <>
      <PageHeader
        titulo={`Editar ${cliente.nome}`}
        voltar={{ href: `/clientes/${id}`, rotulo: 'Ficha do cliente' }}
        acoes={
          <ActionButton
            acao={excluirCliente.bind(null, id)}
            variante="perigo"
            tamanho="md"
            confirmar={`Excluir ${cliente.nome}? Esta ação não pode ser desfeita.`}
          >
            <Trash2 /> Excluir
          </ActionButton>
        }
      />
      <FormularioCliente acao={salvarCliente.bind(null, id)} cliente={cliente} cancelarHref={`/clientes/${id}`} />
    </>
  )
}
