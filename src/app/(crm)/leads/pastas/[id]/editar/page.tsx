import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { excluirPasta, salvarPasta } from '@/features/leads/actions'
import { FormularioPasta } from '@/features/leads/components/formularios'
import { obterPasta } from '@/features/leads/queries'

export const metadata: Metadata = { title: 'Editar pasta de leads' }

export default async function PaginaEditarPasta({ params }: PageProps<'/leads/pastas/[id]/editar'>) {
  const { id } = await params
  const pasta = await obterPasta(id)
  if (!pasta) notFound()

  return (
    <>
      <PageHeader
        titulo={pasta.nome ?? 'Pasta'}
        voltar={{ href: `/leads/pastas/${id}`, rotulo: 'Voltar à pasta' }}
        acoes={
          <ActionButton
            acao={excluirPasta.bind(null, id)}
            variante="perigo"
            tamanho="md"
            confirmar={`Excluir a pasta “${pasta.nome}”? Só é possível se ela estiver vazia.`}
          >
            <Trash2 /> Excluir pasta
          </ActionButton>
        }
      />
      <FormularioPasta acao={salvarPasta.bind(null, id)} pasta={pasta} voltar={`/leads/pastas/${id}`} />
    </>
  )
}
