import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { excluirLista, salvarLista } from '@/features/leads/actions'
import { FormularioLista } from '@/features/leads/components/formularios'
import { obterLista, opcoesPastas } from '@/features/leads/queries'
import { formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Editar lista de leads' }

export default async function PaginaEditarLista({ params }: PageProps<'/leads/listas/[id]/editar'>) {
  const { id } = await params
  const [lista, pastas] = await Promise.all([obterLista(id), opcoesPastas()])
  if (!lista) notFound()

  return (
    <>
      <PageHeader
        titulo={lista.nome}
        voltar={{ href: `/leads/listas/${id}`, rotulo: 'Voltar à lista' }}
        acoes={
          <ActionButton
            acao={excluirLista.bind(null, id, lista.pasta_id)}
            variante="perigo"
            tamanho="md"
            confirmar={`Excluir a lista “${lista.nome}” e seus ${formatarNumero(lista.total)} lead(s)? Não dá para desfazer.`}
          >
            <Trash2 /> Excluir lista
          </ActionButton>
        }
      />
      <FormularioLista acao={salvarLista.bind(null, id)} lista={lista} pastas={pastas} />
    </>
  )
}
