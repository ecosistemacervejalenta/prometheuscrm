import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { ImportadorLeads } from '@/features/leads/components/importador'
import { opcoesPastas } from '@/features/leads/queries'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Importar lista de leads' }

export default async function PaginaImportarLeads({ searchParams }: PageProps<'/leads/importar'>) {
  const pastaInicial = param((await searchParams).pasta)
  const pastas = await opcoesPastas()
  return (
    <>
      <PageHeader
        titulo="Importar lista"
        contexto="CSV · Excel (XLS/XLSX) · TXT"
        voltar={pastaInicial ? { href: `/leads/pastas/${pastaInicial}`, rotulo: 'Voltar à pasta' } : { href: '/leads', rotulo: 'Banco de Leads' }}
      />
      <ImportadorLeads pastas={pastas} pastaInicial={pastaInicial} />
    </>
  )
}
