import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { salvarCliente } from '@/features/clientes/actions'
import { FormularioCliente } from '@/features/clientes/components/formulario-cliente'

export const metadata: Metadata = { title: 'Novo cliente' }

export default function PaginaNovoCliente() {
  return (
    <>
      <PageHeader titulo="Novo cliente" voltar={{ href: '/clientes', rotulo: 'Clientes' }} />
      <FormularioCliente acao={salvarCliente.bind(null, null)} cancelarHref="/clientes" />
    </>
  )
}
