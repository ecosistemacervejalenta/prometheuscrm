import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
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
        <div className="border-b border-linha p-3 lg:p-4">
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
          <>
          <ListaMobile>
            {fornecedores.map((f) => {
              const vendedores = f.fornecedor_vendedores.map(({ vendedores: v }) => v?.nome).filter(Boolean)
              return (
                <ItemMobile
                  key={f.id}
                  href={`/fornecedores/${f.id}/editar`}
                  inicio={
                    <span className="grid size-10 place-items-center rounded-xl bg-shopify-50 text-shopify-700">
                      <Building2 className="size-5" aria-hidden />
                    </span>
                  }
                  titulo={
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{f.nome}</span>
                      {!f.ativo && <Badge className="h-5 px-1.5 text-[10px]">Inativa</Badge>}
                    </span>
                  }
                  subtitulo={[[f.cidade, f.uf].filter(Boolean).join('/'), vendedores.length ? `${vendedores.length} vendedor(es)` : null].filter(Boolean).join(' · ') || 'Sem detalhes'}
                  extra={
                    vendedores.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {vendedores.slice(0, 3).map((nome) => <Badge key={nome} tom="app">{nome}</Badge>)}
                      </div>
                    )
                  }
                />
              )
            })}
          </ListaMobile>
          <Table somenteDesktop>
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
          </>
        )}
      </Card>
    </>
  )
}
