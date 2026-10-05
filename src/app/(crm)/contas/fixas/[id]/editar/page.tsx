import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { excluirContaFixa, salvarContaFixa } from '@/features/contas/actions'
import { FormularioContaFixa } from '@/features/contas/components/formularios'
import { obterContaFixa } from '@/features/contas/queries'
import { nomesDasCategorias } from '@/features/financeiro/queries'
import { opcoesFornecedores } from '@/features/fornecedores/queries'
import { mesAtual } from '@/lib/datas'

export const metadata: Metadata = { title: 'Editar conta fixa' }

export default async function PaginaEditarContaFixa({ params }: PageProps<'/contas/fixas/[id]/editar'>) {
  const { id } = await params
  const [conta, fornecedores, categorias] = await Promise.all([obterContaFixa(id), opcoesFornecedores(), nomesDasCategorias('pagar')])
  if (!conta) notFound()

  return (
    <>
      <PageHeader
        titulo={conta.descricao}
        voltar={{ href: '/contas/fixas', rotulo: 'Contas fixas' }}
        acoes={
          <ActionButton
            acao={excluirContaFixa.bind(null, id)}
            variante="perigo"
            tamanho="md"
            confirmar="Excluir o modelo? As contas até este mês continuam no histórico; as pendentes dos próximos meses são removidas."
          >
            <Trash2 /> Excluir
          </ActionButton>
        }
      />
      <FormularioContaFixa
        acao={salvarContaFixa.bind(null, id)}
        fornecedores={fornecedores}
        categorias={categorias}
        conta={conta}
        mesAtual={mesAtual()}
      />
    </>
  )
}
