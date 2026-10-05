import type { Metadata } from 'next'

import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { FormularioNovaCategoria, LinhaCategoria } from '@/features/financeiro/components/categorias'
import { listarCategorias } from '@/features/financeiro/queries'
import type { NaturezaFinanceira } from '@/types'

export const metadata: Metadata = { title: 'Categorias financeiras' }

const SECOES: Array<{ natureza: NaturezaFinanceira; titulo: string; descricao: string }> = [
  { natureza: 'pagar', titulo: 'Contas a pagar', descricao: 'Usadas nas contas fixas e variáveis.' },
  { natureza: 'receber', titulo: 'Contas a receber', descricao: 'Usadas nos lançamentos a receber.' },
]

export default async function PaginaCategorias({ searchParams }: PageProps<'/contas/categorias'>) {
  const categorias = await listarCategorias()
  const voltarParaReceber = (await searchParams).de === 'receber'

  return (
    <>
      <PageHeader
        titulo="Categorias"
        contexto="Organize as contas a pagar e a receber"
        descricao="Também dá para criar uma categoria na hora, no próprio lançamento, pela opção “+ Nova categoria…”."
        voltar={voltarParaReceber ? { href: '/receber', rotulo: 'Contas a receber' } : { href: '/contas', rotulo: 'Contas a pagar' }}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {SECOES.map((secao) => (
          <Card key={secao.natureza}>
            <CardHeader titulo={secao.titulo} descricao={`${categorias[secao.natureza].length} categoria(s) · ${secao.descricao}`} />
            <FormularioNovaCategoria natureza={secao.natureza} />
            <ul className="divide-y divide-linha border-t border-linha">
              {categorias[secao.natureza].map((c) => (
                <LinhaCategoria key={c.id} id={c.id} nome={c.nome} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  )
}
