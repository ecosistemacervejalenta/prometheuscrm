import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { salvarPasta } from '@/features/leads/actions'
import { FormularioPasta } from '@/features/leads/components/formularios'

export const metadata: Metadata = { title: 'Nova pasta de leads' }

export default function PaginaNovaPasta() {
  return (
    <>
      <PageHeader titulo="Nova pasta" voltar={{ href: '/leads', rotulo: 'Banco de Leads' }} />
      <FormularioPasta acao={salvarPasta.bind(null, null)} voltar="/leads" />
    </>
  )
}
