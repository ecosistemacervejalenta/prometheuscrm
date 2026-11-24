import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, SearchX } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { CadastroPorSku } from '@/features/lotes/components/cadastro-por-sku'
import { SeloValidade } from '@/features/lotes/components/selo-validade'
import { FILTROS_LOTES, filtrarCervejas, listarCervejasDosLotes, resumoDosLotes, type FiltroLotes } from '@/features/lotes/queries'
import { DIAS_VENCE_LOGO } from '@/features/lotes/validade'
import { FotoProduto } from '@/features/produtos/components/foto-produto'
import { formatarData, formatarNumero } from '@/lib/format'
import { cn, param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Lotes e validades' }

const estoque = (unidades: number | null) => (unidades === null ? '—' : `${formatarNumero(unidades)} un.`)
const quantosLotes = (n: number) => `${n} lote${n === 1 ? '' : 's'}`

export default async function PaginaLotes({ searchParams }: PageProps<'/lotes'>) {
  const busca = await searchParams
  const q = param(busca.q)
  const situacao = param(busca.situacao)
  const filtro = FILTROS_LOTES.find((f) => f === situacao)

  const todas = await listarCervejasDosLotes()
  const resumo = resumoDosLotes(todas)
  const cervejas = filtrarCervejas(todas, { busca: q, filtro })

  const filtros: Array<{ chave: FiltroLotes | undefined; rotulo: string; total: number; alerta?: boolean }> = [
    { chave: undefined, rotulo: 'Todas', total: resumo.cervejas },
    { chave: 'vencidos', rotulo: 'Com lote vencido', total: resumo.vencidos, alerta: true },
    { chave: 'vence_logo', rotulo: `Vencem em ${DIAS_VENCE_LOGO} dias`, total: resumo.venceLogo, alerta: true },
    { chave: 'sem_lote', rotulo: 'Sem lote', total: resumo.semLote },
  ]
  const linkDoFiltro = (chave: FiltroLotes | undefined) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (chave) params.set('situacao', chave)
    return params.size ? `/lotes?${params}` : '/lotes'
  }

  return (
    <>
      <PageHeader
        titulo="Lotes e validades"
        contexto={`${resumo.cervejas} cerveja(s) · ${quantosLotes(resumo.lotes)}`}
        descricao="Registre aqui o lote e a validade de cada cerveja."
      />

      <Card className="mb-4 lg:mb-6">
        <CardHeader
          titulo="Cadastrar cerveja pelo SKU"
          descricao="O CRM consulta o produto na Olist e traz a foto principal, o nome, o SKU e as unidades em estoque. Nada é enviado ou alterado na Olist."
        />
        <CardContent>
          <CadastroPorSku foco={resumo.cervejas === 0} />
        </CardContent>
      </Card>

      <Card>
        {resumo.cervejas === 0 ? (
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhuma cerveja no controle"
            descricao="Digite acima o SKU de uma cerveja para puxá-la da Olist. Depois é só cadastrar o lote e a validade."
          />
        ) : (
          <>
            <div className="space-y-3 border-b border-linha p-3 lg:p-4">
              <FilterBar caminho="/lotes">
                <SearchField valor={q} placeholder="Buscar por nome, SKU ou lote" />
                {filtro && <input type="hidden" name="situacao" value={filtro} />}
              </FilterBar>
              <nav className="flex flex-wrap gap-2" aria-label="Filtrar por situação">
                {filtros.map((f) => {
                  const ativo = f.chave === filtro
                  return (
                    <Link
                      key={f.rotulo}
                      href={linkDoFiltro(f.chave)}
                      aria-current={ativo ? 'page' : undefined}
                      className={cn(
                        'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors',
                        ativo ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie hover:bg-papel',
                      )}
                    >
                      {f.rotulo}
                      <span className={cn('tipo-dado text-[12px]', ativo ? 'text-white/70' : f.alerta && f.total > 0 ? 'text-perigo' : 'text-suave')}>
                        {f.total}
                      </span>
                    </Link>
                  )
                })}
              </nav>
            </div>

            {cervejas.length === 0 ? (
              <EmptyState
                icone={SearchX}
                titulo="Nenhuma cerveja encontrada"
                descricao="Nenhuma cerveja do controle bate com a busca e o filtro escolhidos."
                acao={<ButtonLink href="/lotes">Ver todas</ButtonLink>}
              />
            ) : (
              <>
                <ListaMobile>
                  {cervejas.map((c) => {
                    const proximo = c.lotes[0]
                    return (
                      <ItemMobile
                        key={c.id}
                        href={`/lotes/${c.id}`}
                        inicio={<FotoProduto url={c.foto_url} nome={c.nome} />}
                        titulo={c.nome}
                        subtitulo={`SKU ${c.sku} · ${estoque(c.estoque_olist)} na Olist`}
                        extra={
                          proximo ? (
                            <span className="flex flex-wrap items-center gap-2">
                              <SeloValidade validade={proximo.validade} />
                              <span className="tipo-dado text-[12px] text-suave">
                                {formatarData(proximo.validade)} · {quantosLotes(c.lotes.length)}
                              </span>
                            </span>
                          ) : (
                            <Badge>Sem lote</Badge>
                          )
                        }
                      />
                    )
                  })}
                </ListaMobile>
                <Table somenteDesktop>
                  <THead>
                    <TR>
                      <TH>Cerveja</TH>
                      <TH>SKU</TH>
                      <TH className="text-right">Estoque na Olist</TH>
                      <TH>Lotes</TH>
                      <TH>Validade mais próxima</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {cervejas.map((c) => {
                      const proximo = c.lotes[0]
                      return (
                        <TR key={c.id} className="hover:bg-papel/60">
                          <TD>
                            <Link href={`/lotes/${c.id}`} className="flex items-center gap-3">
                              <FotoProduto url={c.foto_url} nome={c.nome} />
                              <span className="font-semibold">{c.nome}</span>
                            </Link>
                          </TD>
                          <TD className="tipo-dado text-[13px] text-suave">{c.sku}</TD>
                          <TD className="tipo-dado text-right">{estoque(c.estoque_olist)}</TD>
                          <TD className="text-[13px] whitespace-nowrap text-suave">
                            {c.lotes.length ? quantosLotes(c.lotes.length) : '—'}
                            {c.vencidos > 0 && <span className="font-semibold text-perigo"> · {c.vencidos} vencido{c.vencidos === 1 ? '' : 's'}</span>}
                          </TD>
                          <TD>
                            {proximo ? (
                              <span className="flex flex-wrap items-center gap-2">
                                <SeloValidade validade={proximo.validade} />
                                <span className="tipo-dado text-[13px] whitespace-nowrap text-suave">
                                  {formatarData(proximo.validade)} · lote {proximo.lote}
                                </span>
                              </span>
                            ) : (
                              <Badge>Sem lote</Badge>
                            )}
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </>
            )}
          </>
        )}
      </Card>
    </>
  )
}
