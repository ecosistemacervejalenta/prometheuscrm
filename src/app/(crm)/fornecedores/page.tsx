import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { TabsLinks } from '@/components/ui/tabs'
import { listarFornecedores } from '@/features/fornecedores/queries'
import { formatarCnpj } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Fornecedores' }

export default async function PaginaFornecedores({ searchParams }: PageProps<'/fornecedores'>) {
  const q = param((await searchParams).q)
  const fornecedores = await listarFornecedores(q)

  return (
    <>
      <PageHeader
        titulo="Fornecedores"
        contexto="Empresas e vendedores que atendem a loja"
        acoes={
          <>
            <ButtonLink href="/fornecedores/vendedores/novo">
              <Plus /> Vendedor
            </ButtonLink>
            <ButtonLink href="/fornecedores/novo" variante="primario">
              <Plus /> Nova empresa
            </ButtonLink>
          </>
        }
      />
      <TabsLinks
        ativa="empresas"
        abas={[
          { chave: 'empresas', href: '/fornecedores', rotulo: 'Empresas', contagem: fornecedores.length },
          { chave: 'vendedores', href: '/fornecedores/vendedores', rotulo: 'Vendedores' },
        ]}
      />

      <Card>
        <div className="border-b border-linha p-4">
          <FilterBar caminho="/fornecedores">
            <SearchField valor={q} placeholder="Buscar por nome, razão social ou CNPJ" />
          </FilterBar>
        </div>
        {fornecedores.length === 0 ? (
          <EmptyState
            icone={Building2}
            titulo="Nenhuma empresa cadastrada"
            descricao="Cadastre cervejarias, distribuidoras e prestadores de serviço."
            acao={<ButtonLink href="/fornecedores/novo" variante="primario"><Plus /> Nova empresa</ButtonLink>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Empresa</TH>
                <TH>CNPJ</TH>
                <TH>Cidade</TH>
                <TH>Vendedores</TH>
                <TH>Contato</TH>
              </TR>
            </THead>
            <TBody>
              {fornecedores.map((f) => (
                <TR key={f.id} className="hover:bg-papel/60">
                  <TD>
                    <Link href={`/fornecedores/${f.id}/editar`} className="font-semibold hover:text-volt-700">
                      {f.nome}
                    </Link>
                    {f.razao_social && <p className="text-[13px] text-suave">{f.razao_social}</p>}
                    {!f.ativo && <Badge className="mt-1">Inativa</Badge>}
                  </TD>
                  <TD className="tipo-dado text-[13px] whitespace-nowrap">{formatarCnpj(f.cnpj)}</TD>
                  <TD className="text-[13px]">{[f.cidade, f.uf].filter(Boolean).join('/') || '—'}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {f.fornecedor_vendedores.length === 0 && <span className="text-[13px] text-suave">—</span>}
                      {f.fornecedor_vendedores.map(({ vendedores: v }) =>
                        v ? (
                          <Link key={v.id} href={`/fornecedores/vendedores/${v.id}/editar`}>
                            <Badge tom="app">{v.nome}</Badge>
                          </Link>
                        ) : null,
                      )}
                    </div>
                  </TD>
                  <TD className="text-[13px] text-suave">
                    {f.telefone && <p className="tipo-dado">{f.telefone}</p>}
                    {f.email && <p>{f.email}</p>}
                    {!f.telefone && !f.email && '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  )
}
