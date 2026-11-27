import type { Metadata } from 'next'
import Link from 'next/link'
import { Hop, RefreshCw, Settings2, Users } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { TabsLinks } from '@/components/ui/tabs'
import { atualizarComprasDaLoja } from '@/features/estilos/actions'
import { TIPOS_DE_COLECAO } from '@/features/estilos/classificacao'
import { CriarLista } from '@/features/estilos/components/criar-lista'
import { EscolherColecoes } from '@/features/estilos/components/escolher-colecoes'
import { TabelaDoPublico } from '@/features/estilos/components/tabela-do-publico'
import { estadoDaLeitura, publicoPorColecoes, rankingDeColecoes, type EstadoDaLeitura } from '@/features/estilos/queries'
import { hrefDoFiltro, lerFiltro, nomeSugerido, PERIODOS } from '@/features/estilos/schema'
import { formatarData, formatarHaQuanto, formatarNumero, formatarRelativo } from '@/lib/format'

export const metadata: Metadata = { title: 'Clientes por estilo' }

// "Atualizar agora" lê a loja da Shopify nesta página (pedidos, collections e produtos).
export const maxDuration = 120

export default async function PaginaClientesPorEstilo({ searchParams }: PageProps<'/clientes/por-estilo'>) {
  const filtro = lerFiltro(await searchParams)
  const [estado, ranking, publico] = await Promise.all([estadoDaLeitura(), rankingDeColecoes(filtro.periodo), publicoPorColecoes(filtro)])

  const titulos = filtro.colecoes.map((id) => ranking.find((r) => r.colecao_id === id)?.titulo).filter((t): t is string => Boolean(t))
  const recebem = publico.filter((c) => c.recebe_campanha).length
  const garrafas = publico.reduce((s, c) => s + c.garrafas, 0)
  const maisRecente = publico.reduce<string | null>((m, c) => (!m || c.ultima_compra > m ? c.ultima_compra : m), null)
  const doTipo = ranking.filter((r) => r.tipo === filtro.tipo && r.compradores > 0)
  const periodo = PERIODOS.find((p) => p.valor === filtro.periodo)!.rotulo.toLowerCase()

  return (
    <>
      <PageHeader
        titulo="Clientes por estilo"
        contexto={estado.lojaNome ? `Shopify · ${estado.lojaNome}` : 'Shopify · collections da loja'}
        descricao="Quem comprou cada estilo e cervejaria da loja. Marque as collections, confira o público e crie a lista para a campanha."
        voltar={{ href: '/clientes', rotulo: 'Clientes' }}
        acoes={
          <>
            <ButtonLink href="/clientes/por-estilo/colecoes" variante="secundario">
              <Settings2 /> Organizar collections
            </ButtonLink>
            <ActionButton acao={atualizarComprasDaLoja} variante="secundario" tamanho="md">
              <RefreshCw /> Atualizar agora
            </ActionButton>
          </>
        }
      />

      <AvisosDaLeitura estado={estado} />

      {estado.compras === 0 ? (
        <Card>
          <EmptyState
            icone={Hop}
            titulo={estado.conectado ? 'A loja ainda não foi lida' : 'A Shopify não está conectada'}
            descricao={
              estado.conectado
                ? 'Clique em “Atualizar agora” para ler os pedidos e as collections da loja. Depois disso, a leitura roda sozinha a cada 30 minutos.'
                : 'Conecte a loja em Configurações › Shopify para o CRM ler os pedidos.'
            }
            acao={
              estado.conectado ? (
                <ActionButton acao={atualizarComprasDaLoja} variante="primario" tamanho="md">
                  <RefreshCw /> Ler a loja agora
                </ActionButton>
              ) : (
                <ButtonLink href="/configuracoes/shopify" variante="primario">
                  Conectar a Shopify
                </ButtonLink>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              titulo="Montar o público"
              descricao="Entra quem comprou QUALQUER uma das collections marcadas. Os números ao lado são de clientes que compraram no período."
            />
            <CardContent>
              <EscolherColecoes
                filtro={filtro}
                colecoes={ranking.map((r) => ({ id: r.colecao_id, titulo: r.titulo, tipo: r.tipo, compradores: r.compradores }))}
              />
            </CardContent>
          </Card>

          {filtro.colecoes.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi rotulo="Clientes" valor={formatarNumero(publico.length)} detalhe={periodo} />
                <Kpi
                  rotulo="Recebem campanha"
                  valor={formatarNumero(recebem)}
                  detalhe={publico.length > recebem ? `${formatarNumero(publico.length - recebem)} sem WhatsApp ou descadastrados` : 'todos com WhatsApp'}
                  tendencia={recebem > 0 ? 'positiva' : 'neutra'}
                />
                <Kpi rotulo="Garrafas" valor={formatarNumero(garrafas)} detalhe="destas collections" />
                <Kpi rotulo="Compra mais recente" valor={maisRecente ? formatarRelativo(maisRecente) : '—'} detalhe={maisRecente ? formatarData(maisRecente) : undefined} />
              </div>

              <Card className="min-w-0">
                <CardHeader
                  titulo={publico.length === 0 ? 'Ninguém neste público' : `${formatarNumero(publico.length)} ${publico.length === 1 ? 'cliente comprou' : 'clientes compraram'}`}
                  descricao={titulos.length > 0 ? titulos.join(' · ') : undefined}
                />
                {publico.length === 0 ? (
                  <EmptyState
                    icone={Users}
                    titulo="Nenhum cliente com estes filtros"
                    descricao="Tente outro período, tire o “sem comprar há” ou marque mais collections."
                  />
                ) : (
                  <>
                    <CardContent>
                      <CriarLista
                        key={hrefDoFiltro(filtro)}
                        colecoes={filtro.colecoes}
                        periodo={filtro.periodo}
                        semCompra={filtro.semCompra}
                        nomeInicial={nomeSugerido(titulos, filtro.periodo, filtro.semCompra)}
                        recebem={recebem}
                      />
                    </CardContent>
                    <TabelaDoPublico clientes={publico} />
                  </>
                )}
              </Card>
            </>
          )}

          <Card className="min-w-0">
            <CardHeader
              titulo="O que os clientes compram"
              descricao={`Clientes que compraram cada collection (${periodo}). Toque para ver quem são.`}
            />
            <CardContent className="pb-0 lg:pb-0">
              <TabsLinks
                ativa={filtro.tipo}
                abas={TIPOS_DE_COLECAO.filter((t) => t.valor !== 'ignorar').map((t) => ({
                  chave: t.valor,
                  rotulo: t.plural,
                  href: hrefDoFiltro({ ...filtro, tipo: t.valor as typeof filtro.tipo }),
                  contagem: ranking.filter((r) => r.tipo === t.valor && r.compradores > 0).length,
                }))}
              />
            </CardContent>
            {doTipo.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-suave">Nenhuma compra deste tipo no período.</p>
            ) : (
              <>
                <Table somenteDesktop>
                  <THead>
                    <TR>
                      <TH>Collection</TH>
                      <TH className="text-right">Clientes</TH>
                      <TH className="text-right">Garrafas</TH>
                      <TH className="text-right">Pedidos</TH>
                      <TH>Última compra</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {doTipo.map((r) => (
                      <TR key={r.colecao_id}>
                        <TD className="font-semibold">{r.titulo}</TD>
                        <TD className="tipo-dado text-right">{formatarNumero(r.compradores)}</TD>
                        <TD className="tipo-dado text-right">{formatarNumero(r.garrafas)}</TD>
                        <TD className="tipo-dado text-right">{formatarNumero(r.pedidos)}</TD>
                        <TD className="whitespace-nowrap">{formatarData(r.ultima_compra)}</TD>
                        <TD className="text-right">
                          <Link
                            href={hrefDoFiltro({ ...filtro, colecoes: [r.colecao_id] })}
                            scroll={false}
                            className="text-sm font-medium whitespace-nowrap text-volt-700 hover:text-ink"
                          >
                            Ver clientes ›
                          </Link>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <ListaMobile>
                  {doTipo.map((r) => (
                    <ItemMobile
                      key={r.colecao_id}
                      href={hrefDoFiltro({ ...filtro, colecoes: [r.colecao_id] })}
                      titulo={r.titulo}
                      subtitulo={`${formatarNumero(r.garrafas)} garrafas · ${formatarNumero(r.pedidos)} pedidos`}
                      fim={<span className="tipo-dado text-sm font-semibold">{formatarNumero(r.compradores)}</span>}
                    />
                  ))}
                </ListaMobile>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

function AvisosDaLeitura({ estado }: { estado: EstadoDaLeitura }) {
  const avisos = []
  if (estado.erro) {
    avisos.push(
      <Alert key="erro" tom="erro" titulo="A última leitura da loja falhou">
        {estado.erro}
      </Alert>,
    )
  }
  if (estado.conectado && !estado.temHistorico) {
    avisos.push(
      <Alert key="historico" tom="alerta" titulo="Só os pedidos dos últimos 60 dias">
        Para ler a loja desde o primeiro pedido, o app da Shopify precisa da permissão <code>read_all_orders</code> (Dev Dashboard ›
        Prometheus CRM › nova versão). Depois de aprovada, clique em “Atualizar agora”.
      </Alert>,
    )
  }
  if (estado.conectado && !estado.temClientes) {
    avisos.push(
      <Alert key="clientes" tom="info" titulo="Cliente identificado pelo pedido">
        Sem a permissão <code>read_customers</code>, o comprador é reconhecido pelo telefone e e-mail do pedido (sem o cadastro da loja).
      </Alert>,
    )
  }
  return (
    <div className="mb-5 space-y-3 lg:mb-6">
      {avisos}
      {estado.compras > 0 && (
        <p className="tipo-dado text-[13px] text-suave">
          {formatarNumero(estado.compras)} pedidos pagos · {formatarNumero(estado.compradores)} clientes
          {estado.lidoEm && ` · lido ${formatarHaQuanto(estado.lidoEm)}`}
          {estado.historicoCompleto ? ' · desde o 1º pedido' : ' · últimos 60 dias'}
        </p>
      )}
    </div>
  )
}
