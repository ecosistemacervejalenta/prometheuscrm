import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink, FileText, Lock, LockOpen, Pencil, Plus, Send, ShoppingBag, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { ButtonExternal, ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { CanalBadge, StatusPreVendaBadge } from '@/features/pedidos/components/selos'
import { TabelaCobrancas } from '@/features/pedidos/components/tabela-cobrancas'
import { pedidosComItens } from '@/features/pedidos/queries'
import { alterarStatusPreVenda, excluirPreVenda } from '@/features/pre-vendas/actions'
import { itensDaPreVenda, obterPreVenda } from '@/features/pre-vendas/queries'
import { FotoProduto } from '@/features/produtos/components/foto-produto'
import { formatarData, formatarDataHora, formatarMoeda, formatarNumero } from '@/lib/format'
import { exigirEquipe } from '@/lib/auth'
import { linkPreVenda } from '@/lib/url'
import { linkWhatsapp, mensagemPreVenda } from '@/lib/whatsapp'

export async function generateMetadata({ params }: PageProps<'/pre-vendas/[id]'>): Promise<Metadata> {
  const pv = await obterPreVenda((await params).id)
  return { title: pv?.titulo ?? 'Pré-venda' }
}

export default async function PaginaPreVenda({ params }: PageProps<'/pre-vendas/[id]'>) {
  const { id } = await params
  const [{ perfil }, pv, itens, pedidos, config] = await Promise.all([
    exigirEquipe(),
    obterPreVenda(id),
    itensDaPreVenda(id),
    pedidosComItens({ preVendaId: id }),
    obterConfiguracoes(),
  ])
  if (!pv?.id) notFound()

  const link = await linkPreVenda(pv.slug ?? '')
  const mensagem = mensagemPreVenda(
    config,
    { titulo: pv.titulo ?? '', descricao: pv.descricao, encerra_em: pv.encerra_em, previsao_entrega: pv.previsao_entrega },
    link,
  )
  const aReceber = pedidos
    .filter((p) => p.status_pagamento === 'pendente' || p.status_pagamento === 'cobrado')
    .reduce((s, p) => s + Number(p.total), 0)
  const ativa = pv.status_efetivo === 'ativa'
  const admin = perfil.papel === 'admin'
  const faturado = pedidos.reduce((s, p) => s + Number(p.total), 0)

  return (
    <>
      <PageHeader
        titulo={pv.titulo}
        contexto={pv.encerra_em ? `encerra ${formatarDataHora(pv.encerra_em)}` : 'sem data de encerramento'}
        voltar={{ href: '/pre-vendas', rotulo: 'Pré-vendas' }}
        acoes={
          <>
            <ButtonLink href={`/pre-vendas/${id}/editar`}>
              <Pencil /> Editar
            </ButtonLink>
            {ativa ? (
              <ActionButton acao={alterarStatusPreVenda.bind(null, id, 'encerrada')} tamanho="md" confirmar="Encerrar a pré-venda? O link deixa de aceitar pedidos.">
                <Lock /> Encerrar
              </ActionButton>
            ) : (
              <ActionButton acao={alterarStatusPreVenda.bind(null, id, 'ativa')} tamanho="md">
                <LockOpen /> Reabrir
              </ActionButton>
            )}
            <ButtonExternal href={linkWhatsapp(null, mensagem)} variante="primario">
              <Send /> Disparar no WhatsApp
            </ButtonExternal>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        <StatusPreVendaBadge status={pv.status_efetivo} />
        <CanalBadge canal={pv.canal} />
        {pv.previsao_entrega && <span className="tipo-dado text-[12px] text-suave">· entrega prevista {formatarData(pv.previsao_entrega)}</span>}
      </div>

      <section className="mb-5 rounded-cartao bg-ink p-4 text-white sm:p-6 lg:mb-6 print:hidden">
        <p className="tipo-rotulo text-volt">Link da pré-venda</p>
        <p className="tipo-dado mt-2 text-base break-all text-white sm:text-lg">{link}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 *:w-full sm:flex sm:flex-wrap sm:*:w-auto">
          <CopyButton texto={link} rotulo="Copiar link" variante="primario" />
          <CopyButton texto={mensagem} rotulo="Copiar mensagem" />
          <ButtonExternal href={link} tamanho="sm" variante="secundario" className="col-span-2">
            <ExternalLink /> Abrir como cliente
          </ButtonExternal>
        </div>
        <p className="mt-4 text-[13px] text-white/50">
          Cliente que já comprou só digita o WhatsApp: nome e endereço são puxados do cadastro.
        </p>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Pedidos" valor={formatarNumero(pv.pedidos)} />
        <Kpi rotulo="Unidades" valor={formatarNumero(pv.unidades)} />
        <Kpi rotulo="Total vendido" valor={formatarMoeda(pv.total_vendido)} />
        <Kpi rotulo="A receber" valor={formatarMoeda(aReceber)} tendencia={aReceber > 0 ? 'negativa' : 'positiva'} detalhe={`${formatarMoeda(pv.total_recebido)} recebido`} />
      </div>

      <Card className="mb-6">
        <CardHeader titulo="Cervejas da pré-venda" descricao="Vendido e saldo por item." />
        <ListaMobile>
          {itens.map((i) => {
            const total = i.quantidade_disponivel
            const progresso = total ? Math.min(100, ((i.vendido ?? 0) / total) * 100) : null
            return (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <FotoProduto url={i.imagem_url} nome={i.nome ?? ''} className="size-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold">{i.nome}</p>
                    <p className="tipo-dado shrink-0 text-[13px]">{formatarMoeda(i.preco)}</p>
                  </div>
                  <p className="tipo-dado text-[12px] text-suave">
                    {formatarNumero(i.vendido)} vendido(s)
                    {total ? ` · restam ${formatarNumero(i.restante)}` : ''}
                    {i.limite_por_cliente ? ` · máx. ${i.limite_por_cliente}/cliente` : ''}
                  </p>
                  {progresso !== null && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-papel">
                      <div className="h-full rounded-full bg-volt" style={{ width: `${progresso}%` }} />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ListaMobile>
        <Table somenteDesktop>
          <THead>
            <TR>
              <TH>Cerveja</TH>
              <TH className="text-right">Preço</TH>
              <TH className="text-right">Limite/cliente</TH>
              <TH>Vendido</TH>
            </TR>
          </THead>
          <TBody>
            {itens.map((i) => {
              const total = i.quantidade_disponivel
              const progresso = total ? Math.min(100, ((i.vendido ?? 0) / total) * 100) : null
              return (
                <TR key={i.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <FotoProduto url={i.imagem_url} nome={i.nome ?? ''} className="size-10" />
                      <div>
                        <p className="font-semibold">{i.nome}</p>
                        <p className="text-[12px] text-suave">{[i.estilo, i.volume_ml ? `${i.volume_ml} ml` : null].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                  </TD>
                  <TD className="tipo-dado text-right">{formatarMoeda(i.preco)}</TD>
                  <TD className="tipo-dado text-right">{i.limite_por_cliente ?? '—'}</TD>
                  <TD className="min-w-48">
                    <p className="tipo-dado text-[13px]">
                      {formatarNumero(i.vendido)}
                      {total ? ` de ${formatarNumero(total)} · restam ${formatarNumero(i.restante)}` : ' · sem limite'}
                    </p>
                    {progresso !== null && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-papel">
                        <div className="h-full rounded-full bg-volt" style={{ width: `${progresso}%` }} />
                      </div>
                    )}
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          titulo="Pedidos e cobranças"
          descricao={`${pedidos.length} pedido(s)`}
          acoes={
            <>
              <ButtonLink href={`/grupo-vip?pre_venda=${id}`} tamanho="sm">
                <FileText /> Relatório para imprimir
              </ButtonLink>
              <ButtonLink href={`/pedidos/novo?pre_venda=${id}`} tamanho="sm">
                <Plus /> Lançar pedido
              </ButtonLink>
            </>
          }
        />
        {pedidos.length === 0 ? (
          <EmptyState
            icone={ShoppingBag}
            titulo="Nenhum pedido ainda"
            descricao="Dispare o link no WhatsApp. Os pedidos aparecem aqui assim que os clientes confirmarem."
          />
        ) : (
          <TabelaCobrancas pedidos={pedidos} config={config} podeExcluir={admin} />
        )}
      </Card>

      {admin && (
        <Card className="mt-6 print:hidden">
          <CardHeader
            titulo="Excluir pré-venda"
            descricao={
              pedidos.length > 0
                ? `Apaga a pré-venda, o link e ${pedidos.length === 1 ? 'o pedido' : `os ${pedidos.length} pedidos`} dela (${formatarMoeda(faturado)}), que saem do faturamento do Grupo VIP. Não dá para desfazer.`
                : 'Apaga a pré-venda e o link deixa de funcionar. Não dá para desfazer.'
            }
            acoes={
              <ActionButton
                acao={excluirPreVenda.bind(null, id, pedidos.length > 0)}
                variante="perigo"
                tamanho="md"
                confirmar={
                  pedidos.length > 0
                    ? `Excluir "${pv.titulo}" e ${pedidos.length === 1 ? 'o pedido' : `os ${pedidos.length} pedidos`} dela (${formatarMoeda(faturado)})? Isso não pode ser desfeito.`
                    : `Excluir "${pv.titulo}"? Isso não pode ser desfeito.`
                }
              >
                <Trash2 /> Excluir pré-venda
              </ActionButton>
            }
          />
        </Card>
      )}
    </>
  )
}
