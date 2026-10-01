import type { Metadata } from 'next'
import Link from 'next/link'
import { Beer, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { FotoProduto } from '@/features/produtos/components/foto-produto'
import { listarProdutos } from '@/features/produtos/queries'
import { formatarMoeda } from '@/lib/format'
import { cn, param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Produtos' }

export default async function PaginaProdutos({ searchParams }: PageProps<'/produtos'>) {
  const busca = await searchParams
  const q = param(busca.q)
  const inativos = param(busca.inativos) === '1'
  const produtos = await listarProdutos({ busca: q, inativos })

  return (
    <>
      <PageHeader
        titulo="Produtos"
        contexto={`${produtos.length} cerveja(s) ${inativos ? 'no catálogo' : 'ativas'}`}
        acoes={
          <ButtonLink href="/produtos/novo" variante="primario">
            <Plus /> Novo produto
          </ButtonLink>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-linha p-4">
          <FilterBar caminho="/produtos" className="flex-1">
            <SearchField valor={q} placeholder="Buscar por nome, estilo, cervejaria ou SKU" />
            {inativos && <input type="hidden" name="inativos" value="1" />}
          </FilterBar>
          <Link
            href={inativos ? '/produtos' : '/produtos?inativos=1'}
            className={cn(
              'inline-flex h-10 items-center rounded-xl border px-3 text-sm font-semibold',
              inativos ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie hover:bg-papel',
            )}
          >
            Mostrar inativos
          </Link>
        </div>
        {produtos.length === 0 ? (
          <EmptyState
            icone={Beer}
            titulo="Nenhum produto"
            descricao="Cadastre as cervejas para montar pré-vendas e pedidos."
            acao={<ButtonLink href="/produtos/novo" variante="primario"><Plus /> Novo produto</ButtonLink>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cerveja</TH>
                <TH>Estilo</TH>
                <TH>Volume · ABV</TH>
                <TH>SKU</TH>
                <TH className="text-right">Preço</TH>
              </TR>
            </THead>
            <TBody>
              {produtos.map((p) => (
                <TR key={p.id} className={cn('hover:bg-papel/60', !p.ativo && 'opacity-60')}>
                  <TD>
                    <Link href={`/produtos/${p.id}/editar`} className="flex items-center gap-3">
                      <FotoProduto url={p.imagem_url} nome={p.nome} />
                      <span>
                        <span className="block font-semibold">{p.nome}</span>
                        <span className="block text-[13px] text-suave">
                          {p.cervejaria ?? p.fornecedores?.nome ?? '—'}
                          {!p.ativo && ' · inativo'}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD>{p.estilo ? <Badge>{p.estilo}</Badge> : '—'}</TD>
                  <TD className="tipo-dado text-[13px] text-suave">
                    {p.volume_ml ? `${p.volume_ml} ml` : '—'}
                    {p.teor_alcoolico !== null && ` · ${String(p.teor_alcoolico).replace('.', ',')}%`}
                  </TD>
                  <TD className="tipo-dado text-[13px] text-suave">{p.sku ?? '—'}</TD>
                  <TD className="tipo-dado text-right">{formatarMoeda(p.preco)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  )
}
