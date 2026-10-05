import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Plus, Users } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ButtonExternal, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { TabsLinks } from '@/components/ui/tabs'
import { listarVendedores } from '@/features/fornecedores/queries'
import { formatarWhatsapp } from '@/lib/format'
import { param } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/whatsapp'

export const metadata: Metadata = { title: 'Vendedores' }

export default async function PaginaVendedores({ searchParams }: PageProps<'/fornecedores/vendedores'>) {
  const q = param((await searchParams).q)
  const vendedores = await listarVendedores(q)

  return (
    <>
      <PageHeader
        titulo="Fornecedores"
        contexto="Empresas e vendedores que atendem a loja"
        acoes={
          <>
            <ButtonLink href="/fornecedores/novo">
              <Plus /> Empresa
            </ButtonLink>
            <ButtonLink href="/fornecedores/vendedores/novo" variante="primario">
              <Plus /> Novo vendedor
            </ButtonLink>
          </>
        }
      />
      <TabsLinks
        ativa="vendedores"
        abas={[
          { chave: 'empresas', href: '/fornecedores', rotulo: 'Empresas' },
          { chave: 'vendedores', href: '/fornecedores/vendedores', rotulo: 'Vendedores', contagem: vendedores.length },
        ]}
      />

      <Card>
        <div className="border-b border-linha p-3 lg:p-4">
          <FilterBar caminho="/fornecedores/vendedores">
            <SearchField valor={q} placeholder="Buscar vendedor" />
          </FilterBar>
        </div>
        {vendedores.length === 0 ? (
          <EmptyState
            icone={Users}
            titulo="Nenhum vendedor cadastrado"
            descricao="Cadastre quem atende a loja e as empresas que cada um representa."
            acao={<ButtonLink href="/fornecedores/vendedores/novo" variante="primario"><Plus /> Novo vendedor</ButtonLink>}
          />
        ) : (
          <>
          <ListaMobile>
            {vendedores.map((v) => {
              const empresas = v.fornecedor_vendedores.map(({ fornecedores: f }) => f?.nome).filter(Boolean)
              return (
                <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/fornecedores/vendedores/${v.id}/editar`} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
                    <Avatar nome={v.nome} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                        <span className="truncate">{v.nome}</span>
                        {!v.ativo && <Badge className="h-5 px-1.5 text-[10px]">Inativo</Badge>}
                      </span>
                      <span className="block truncate text-[13px] text-suave">
                        {empresas.length ? empresas.join(', ') : 'Nenhuma empresa vinculada'}
                      </span>
                    </span>
                  </Link>
                  {v.whatsapp && (
                    <a
                      href={linkWhatsapp(v.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-whatsapp-50 text-whatsapp-700 active:opacity-70"
                      aria-label={`Conversar com ${v.nome} no WhatsApp`}
                    >
                      <MessageCircle className="size-5" />
                    </a>
                  )}
                </li>
              )
            })}
          </ListaMobile>
          <Table somenteDesktop>
            <THead>
              <TR>
                <TH>Vendedor</TH>
                <TH>Empresas que representa</TH>
                <TH>WhatsApp</TH>
                <TH className="text-right">Contato</TH>
              </TR>
            </THead>
            <TBody>
              {vendedores.map((v) => (
                <TR key={v.id} className="hover:bg-papel/60">
                  <TD>
                    <Link href={`/fornecedores/vendedores/${v.id}/editar`} className="flex items-center gap-3">
                      <Avatar nome={v.nome} />
                      <span>
                        <span className="block font-semibold">{v.nome}</span>
                        <span className="block text-[13px] text-suave">{v.email ?? '—'}</span>
                      </span>
                    </Link>
                    {!v.ativo && <Badge className="mt-1">Inativo</Badge>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {v.fornecedor_vendedores.length === 0 && <span className="text-[13px] text-suave">—</span>}
                      {v.fornecedor_vendedores.map(({ fornecedores: f }) =>
                        f ? <Badge key={f.id} tom="shopify">{f.nome}</Badge> : null,
                      )}
                    </div>
                  </TD>
                  <TD className="tipo-dado text-[13px] whitespace-nowrap">{formatarWhatsapp(v.whatsapp)}</TD>
                  <TD className="text-right">
                    {v.whatsapp && (
                      <ButtonExternal href={linkWhatsapp(v.whatsapp)} tamanho="sm" variante="secundario">
                        <MessageCircle /> Conversar
                      </ButtonExternal>
                    )}
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
