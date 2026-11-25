import type { Metadata } from 'next'
import Link from 'next/link'
import { BellRing, CalendarClock, RefreshCw, SearchX, Send } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { testarAvisoNoGrupo } from '@/features/lotes/actions-avisos'
import { CadastroPorSku } from '@/features/lotes/components/cadastro-por-sku'
import { PainelValidades } from '@/features/lotes/components/painel-validades'
import { FREQUENCIA_LEITURA, quandoLeu, resumoLeituras } from '@/features/lotes/leitura'
import { SeloValidade } from '@/features/lotes/components/selo-validade'
import {
  cervejasSemLote,
  contarLotes,
  FILTROS_LOTES,
  filtrarLotes,
  listarCervejasDosLotes,
  lotesPorValidade,
  resumoDosLotes,
} from '@/features/lotes/queries'
import { SITUACOES_VALIDADE } from '@/features/lotes/validade'
import { FotoProduto } from '@/features/produtos/components/foto-produto'
import { formatarData, formatarHaQuanto, formatarNumero } from '@/lib/format'
import { cn, param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Lotes e validades' }

const POR_PAGINA = 50

const unidades = (n: number | null) => (n === null ? '—' : `${formatarNumero(n)} un.`)
const plural = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`

export default async function PaginaLotes({ searchParams }: PageProps<'/lotes'>) {
  const busca = await searchParams
  const q = param(busca.q)
  const situacaoDaUrl = param(busca.situacao)
  const filtro = FILTROS_LOTES.find((f) => f === situacaoDaUrl)
  const pagina = Math.max(1, Math.floor(Number(param(busca.pagina))) || 1)

  const cervejas = await listarCervejasDosLotes()
  const resumo = resumoDosLotes(cervejas)
  const leituras = resumoLeituras(cervejas)

  // A lista mostra lotes (um por linha); "sem lote" mostra as cervejas que ainda não têm nenhum.
  const verSemLote = filtro === 'sem_lote'
  const faixa = SITUACOES_VALIDADE.find((s) => s.chave === filtro)
  const semLote = verSemLote ? cervejasSemLote(cervejas, q) : []
  const lotes = verSemLote ? [] : filtrarLotes(lotesPorValidade(cervejas), { busca: q, situacao: faixa?.chave })
  const totalDaLista = verSemLote ? semLote.length : lotes.length
  const inicio = (pagina - 1) * POR_PAGINA
  const lotesDaPagina = lotes.slice(inicio, inicio + POR_PAGINA)
  const semLoteDaPagina = semLote.slice(inicio, inicio + POR_PAGINA)

  const tituloDaLista = verSemLote ? 'Sem lote · entraram na Olist e falta cadastrar o lote' : faixa ? `${faixa.rotulo} · ${faixa.faixa.toLowerCase()}` : 'Todos os lotes'
  const contagem = contarLotes(lotes)
  const resumoDaLista = verSemLote
    ? `${plural(semLote.length, 'cerveja', 'cervejas')} · ${formatarNumero(resumo.unidadesSemLote)} un. sem lote`
    : `${plural(contagem.lotes, 'lote', 'lotes')} · ${formatarNumero(contagem.unidades)} un.`
  const linkSemLote = (() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (!verSemLote) params.set('situacao', 'sem_lote')
    return params.size ? `/lotes?${params}` : '/lotes'
  })()

  return (
    <>
      <PageHeader
        titulo="Lotes e validades"
        acoes={
          <>
            <ButtonLink href="/lotes/avisos" tamanho="md">
              <BellRing /> Avisos no grupo
            </ButtonLink>
            <ActionButton acao={testarAvisoNoGrupo} tamanho="md" titulo="Manda uma mensagem de teste para o grupo da equipe">
              <Send /> Testar aviso no grupo
            </ActionButton>
          </>
        }
        contexto={`${plural(resumo.cervejas, 'cerveja', 'cervejas')} · ${plural(resumo.total.lotes, 'lote', 'lotes')} · ${formatarNumero(resumo.total.unidades)} un.`}
        descricao={
          resumo.cervejas > 0 && (
            <div className="mt-1 space-y-0.5 text-[13px]">
              <p className="flex items-start gap-1.5">
                <RefreshCw className="mt-[3px] size-3.5 shrink-0" aria-hidden />
                <span>
                  Estoque da Olist atualizado em{' '}
                  <span className="font-semibold whitespace-nowrap text-ink">{leituras.ultima ? quandoLeu(leituras.ultima) : 'ainda não lido'}</span>
                </span>
              </p>
              <p className="pl-5 text-sutil">
                Atualiza sozinho {FREQUENCIA_LEITURA} e quando a Olist avisa, dentro do limite dela. As vendas baixam do lote que vence primeiro.
                {leituras.atrasadas > 0 && (
                  <span className="font-semibold text-alerta">
                    {' '}
                    {plural(leituras.atrasadas, 'cerveja', 'cervejas')} sem leitura há mais de 3 h.
                  </span>
                )}
              </p>
            </div>
          )
        }
      />

      <Card className="mb-4 p-4 lg:mb-6 lg:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-6">
          <div className="min-w-0">
            <h2 className="tipo-h3 text-[16px] leading-6">Cadastrar cerveja pelo SKU</h2>
            <p className="mt-0.5 text-sm text-suave">
              O CRM consulta a Olist e traz foto, nome, SKU e estoque. Nada é enviado ou alterado lá.
            </p>
          </div>
          <CadastroPorSku foco={resumo.cervejas === 0} />
        </div>
      </Card>

      {resumo.cervejas === 0 ? (
        <Card>
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhuma cerveja no controle"
            descricao="Digite acima o SKU de uma cerveja para puxá-la da Olist. Depois é só cadastrar o lote e a validade."
          />
        </Card>
      ) : (
        <>
          <PainelValidades resumo={resumo} filtro={filtro} busca={q} />

          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-linha p-3 lg:p-4">
              <div className="min-w-0 flex-1 basis-56">
                <h2 className="tipo-h3 text-[16px] leading-6">{tituloDaLista}</h2>
                <p className="tipo-dado text-[12px] text-suave">{resumoDaLista}</p>
              </div>
              {(resumo.semLote > 0 || verSemLote) && (
                <Link
                  href={linkSemLote}
                  scroll={false}
                  aria-current={verSemLote ? 'true' : undefined}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors',
                    verSemLote ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie hover:bg-papel',
                  )}
                >
                  Sem lote
                  <span className={cn('tipo-dado text-[12px]', verSemLote ? 'text-white/70' : 'text-suave')}>{resumo.semLote}</span>
                </Link>
              )}
              <FilterBar caminho="/lotes" className="w-full lg:w-80">
                <SearchField valor={q} placeholder={verSemLote ? 'Buscar por nome ou SKU' : 'Buscar por nome, SKU ou lote'} />
                {filtro && <input type="hidden" name="situacao" value={filtro} />}
              </FilterBar>
            </div>

            {totalDaLista === 0 ? (
              <EmptyState
                icone={SearchX}
                titulo={verSemLote ? 'Tudo com lote' : 'Nenhum lote aqui'}
                descricao={
                  q
                    ? 'Nada bate com a busca nesta faixa.'
                    : verSemLote
                      ? 'Todas as unidades da Olist estão em algum lote.'
                      : faixa
                        ? `Nenhum lote na faixa “${faixa.rotulo.toLowerCase()}” hoje.`
                        : 'Abra uma cerveja e cadastre o primeiro lote.'
                }
                acao={q || filtro ? <ButtonLink href="/lotes">Ver todos os lotes</ButtonLink> : undefined}
              />
            ) : verSemLote ? (
              <>
                <ListaMobile>
                  {semLoteDaPagina.map((c) => (
                    <ItemMobile
                      key={c.id}
                      href={`/lotes/${c.id}`}
                      inicio={<FotoProduto url={c.foto_url} nome={c.nome} />}
                      titulo={c.nome}
                      subtitulo={`SKU ${c.sku} · ${c.lotes.length ? `${unidades(c.semLote)} sem lote` : `${unidades(c.estoque_olist)} na Olist, nenhum lote`}`}
                    />
                  ))}
                </ListaMobile>
                <Table somenteDesktop>
                  <THead>
                    <TR>
                      <TH>Cerveja</TH>
                      <TH>SKU</TH>
                      <TH className="text-right">Estoque na Olist</TH>
                      <TH className="text-right">Sem lote</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {semLoteDaPagina.map((c) => (
                      <TR key={c.id} className="hover:bg-papel/60">
                        <TD>
                          <Link href={`/lotes/${c.id}`} className="flex items-center gap-3">
                            <FotoProduto url={c.foto_url} nome={c.nome} />
                            <span className="font-semibold">{c.nome}</span>
                          </Link>
                        </TD>
                        <TD className="tipo-dado text-[13px] text-suave">{c.sku}</TD>
                        <TD className="text-right">
                          <span className="tipo-dado">{unidades(c.estoque_olist)}</span>
                          {c.estoque_lido_em && <span className="block text-[11px] leading-4 text-suave">{formatarHaQuanto(c.estoque_lido_em)}</span>}
                        </TD>
                        <TD className="text-right">
                          <span className="tipo-dado font-semibold text-alerta">{unidades(c.lotes.length ? c.semLote : c.estoque_olist)}</span>
                          {c.lotes.length === 0 && <span className="block text-[11px] leading-4 text-suave">nenhum lote</span>}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </>
            ) : (
              <>
                <ListaMobile>
                  {lotesDaPagina.map((l) => (
                    <ItemMobile
                      key={l.id}
                      href={`/lotes/${l.cerveja.id}`}
                      inicio={<FotoProduto url={l.cerveja.foto_url} nome={l.cerveja.nome} />}
                      titulo={l.cerveja.nome}
                      subtitulo={`Lote ${l.lote} · ${l.quantidade === null ? 'falta a quantidade' : unidades(l.quantidade)}`}
                      extra={
                        <span className="flex flex-wrap items-center gap-2">
                          <SeloValidade validade={l.validade} />
                          <span className="tipo-dado text-[12px] text-suave">{formatarData(l.validade)}</span>
                        </span>
                      }
                    />
                  ))}
                </ListaMobile>
                <Table somenteDesktop>
                  <THead>
                    <TR>
                      <TH>Cerveja</TH>
                      <TH>Lote</TH>
                      <TH className="text-right">Quantidade</TH>
                      <TH>Validade</TH>
                      <TH>Situação</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {lotesDaPagina.map((l) => (
                      <TR key={l.id} className="hover:bg-papel/60">
                        <TD>
                          <Link href={`/lotes/${l.cerveja.id}`} className="flex items-center gap-3">
                            <FotoProduto url={l.cerveja.foto_url} nome={l.cerveja.nome} />
                            <span className="min-w-0">
                              <span className="block font-semibold">{l.cerveja.nome}</span>
                              <span className="tipo-dado block text-[12px] text-suave">SKU {l.cerveja.sku}</span>
                            </span>
                          </Link>
                        </TD>
                        <TD className="tipo-dado whitespace-nowrap">{l.lote}</TD>
                        <TD className="text-right whitespace-nowrap">
                          {l.quantidade === null ? (
                            <span className="text-[13px] font-semibold text-alerta">Informar</span>
                          ) : (
                            <span className={cn('tipo-dado', l.quantidade === 0 && 'text-sutil')}>{unidades(l.quantidade)}</span>
                          )}
                        </TD>
                        <TD className="tipo-dado text-[13px] whitespace-nowrap text-suave">{formatarData(l.validade)}</TD>
                        <TD>
                          <SeloValidade validade={l.validade} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </>
            )}
            <Pagination pagina={pagina} porPagina={POR_PAGINA} total={totalDaLista} caminho="/lotes" parametros={{ q, situacao: filtro }} />
          </Card>
        </>
      )}
    </>
  )
}
