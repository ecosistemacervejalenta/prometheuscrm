import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/ui/page-header'
import { atualizarConta } from '@/features/contas/actions'
import { FormularioEdicaoConta } from '@/features/contas/components/formularios'
import { obterConta } from '@/features/contas/queries'
import { nomesDasCategorias } from '@/features/financeiro/queries'
import { opcoesFornecedores } from '@/features/fornecedores/queries'

export const metadata: Metadata = { title: 'Editar conta' }

export default async function PaginaEditarConta({ params }: PageProps<'/contas/[id]/editar'>) {
  const { id } = await params
  const [conta, fornecedores, categorias] = await Promise.all([obterConta(id), opcoesFornecedores(), nomesDasCategorias('pagar')])
  if (!conta) notFound()

  return (
    <>
      <PageHeader
        titulo={conta.descricao}
        voltar={{ href: `/contas?mes=${conta.competencia.slice(0, 7)}`, rotulo: 'Contas do mês' }}
        descricao={
          conta.tipo === 'fixa' ? (
            <>
              Alterações valem só para este mês. Para mudar todos os meses,{' '}
              {conta.conta_fixa_id ? (
                <Link href={`/contas/fixas/${conta.conta_fixa_id}/editar`} className="font-semibold text-volt-700 hover:text-ink">
                  edite a conta fixa
                </Link>
              ) : (
                'edite a conta fixa'
              )}
              .
            </>
          ) : undefined
        }
      />
      <FormularioEdicaoConta acao={atualizarConta.bind(null, id)} fornecedores={fornecedores} categorias={categorias} conta={conta} />
    </>
  )
}
