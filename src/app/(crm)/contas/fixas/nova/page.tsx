import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { TabsLinks } from '@/components/ui/tabs'
import { salvarContaFixa } from '@/features/contas/actions'
import { FormularioContaFixa } from '@/features/contas/components/formularios'
import { opcoesFornecedores } from '@/features/fornecedores/queries'
import { mesAtual } from '@/lib/datas'

export const metadata: Metadata = { title: 'Nova conta fixa' }

export default async function PaginaNovaContaFixa() {
  const fornecedores = await opcoesFornecedores()
  return (
    <>
      <PageHeader titulo="Nova conta" voltar={{ href: '/contas', rotulo: 'Contas a pagar' }} />
      <TabsLinks
        ativa="fixa"
        abas={[
          { chave: 'variavel', href: '/contas/nova', rotulo: 'Variável (avulsa)' },
          { chave: 'fixa', href: '/contas/fixas/nova', rotulo: 'Fixa (todo mês)' },
        ]}
      />
      <FormularioContaFixa acao={salvarContaFixa.bind(null, null)} fornecedores={fornecedores} mesAtual={mesAtual()} />
    </>
  )
}
