import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { criarContaReceber } from '@/features/contas-receber/actions'
import { FormularioContaReceber } from '@/features/contas-receber/components/formularios'
import { pagadoresRecentes } from '@/features/contas-receber/queries'
import { nomesDasCategorias } from '@/features/financeiro/queries'
import { hojeISO } from '@/lib/datas'

export const metadata: Metadata = { title: 'Nova conta a receber' }

export default async function PaginaNovaContaReceber() {
  const [categorias, pagadores] = await Promise.all([nomesDasCategorias('receber'), pagadoresRecentes()])
  return (
    <>
      <PageHeader titulo="Nova conta a receber" voltar={{ href: '/receber', rotulo: 'Contas a receber' }} />
      <FormularioContaReceber acao={criarContaReceber} categorias={categorias} pagadores={pagadores} hoje={hojeISO()} />
    </>
  )
}
