import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/ui/page-header'
import { atualizarContaReceber } from '@/features/contas-receber/actions'
import { FormularioEdicaoContaReceber } from '@/features/contas-receber/components/formularios'
import { obterContaReceber, pagadoresRecentes } from '@/features/contas-receber/queries'
import { nomesDasCategorias } from '@/features/financeiro/queries'

export const metadata: Metadata = { title: 'Editar conta a receber' }

export default async function PaginaEditarContaReceber({ params }: PageProps<'/receber/[id]/editar'>) {
  const { id } = await params
  const [conta, categorias, pagadores] = await Promise.all([
    obterContaReceber(id),
    nomesDasCategorias('receber'),
    pagadoresRecentes(),
  ])
  if (!conta) notFound()

  return (
    <>
      <PageHeader titulo={conta.descricao} voltar={{ href: `/receber?mes=${conta.competencia.slice(0, 7)}`, rotulo: 'Contas do mês' }} />
      <FormularioEdicaoContaReceber
        acao={atualizarContaReceber.bind(null, id)}
        categorias={categorias}
        pagadores={pagadores}
        conta={conta}
      />
    </>
  )
}
