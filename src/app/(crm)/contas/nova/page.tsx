import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { TabsLinks } from '@/components/ui/tabs'
import { criarContaVariavel } from '@/features/contas/actions'
import { FormularioContaVariavel } from '@/features/contas/components/formularios'
import { nomesDasCategorias } from '@/features/financeiro/queries'
import { opcoesFornecedores } from '@/features/fornecedores/queries'
import { hojeISO } from '@/lib/datas'

export const metadata: Metadata = { title: 'Nova conta' }

export default async function PaginaNovaConta() {
  const [fornecedores, categorias] = await Promise.all([opcoesFornecedores(), nomesDasCategorias('pagar')])
  return (
    <>
      <PageHeader titulo="Nova conta" voltar={{ href: '/contas', rotulo: 'Contas a pagar' }} />
      <TabsLinks
        ativa="variavel"
        abas={[
          { chave: 'variavel', href: '/contas/nova', rotulo: 'Variável (avulsa)' },
          { chave: 'fixa', href: '/contas/fixas/nova', rotulo: 'Fixa (todo mês)' },
        ]}
      />
      <FormularioContaVariavel acao={criarContaVariavel} fornecedores={fornecedores} categorias={categorias} hoje={hojeISO()} />
    </>
  )
}
