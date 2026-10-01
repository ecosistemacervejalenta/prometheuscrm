import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, MessageCircle, Phone, Printer } from 'lucide-react'

import { LinhaDoTempo } from '@/components/dominio/linha-do-tempo'
import { PrintButton } from '@/components/ui/print-button'
import { ButtonExternal } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { linkDeCobranca } from '@/features/pedidos/cobranca'
import { BotaoCobrar, ControlePagamento, SeletorStatus } from '@/features/pedidos/components/controles'
import { CanalBadge, PagamentoBadge } from '@/features/pedidos/components/selos'
import { atividadesDoPedido, obterPedido } from '@/features/pedidos/queries'
import { formatarDataHora, formatarEndereco, formatarMoeda, formatarWhatsapp, numeroPedido, primeiroNome, type Endereco } from '@/lib/format'
import { linkWhatsapp } from '@/lib/whatsapp'

export async function generateMetadata({ params }: PageProps<'/pedidos/[id]'>): Promise<Metadata> {
  const pedido = await obterPedido((await params).id)
  return { title: pedido ? `Pedido ${numeroPedido(pedido.numero)}` : 'Pedido' }
}

export default async function PaginaPedido({ params }: PageProps<'/pedidos/[id]'>) {
  const { id } = await params
  const [pedido, atividades, config] = await Promise.all([obterPedido(id), atividadesDoPedido(id), obterConfiguracoes()])
  if (!pedido) notFound()

  const cliente = pedido.clientes
  const endereco = pedido.endereco_entrega as Endereco | null
  const linkCobranca = linkDeCobranca(config, {
    numero: pedido.numero,
    total: pedido.total,
    taxa_entrega: pedido.taxa_entrega,
    cliente,
    pre_venda_titulo: pedido.pre_vendas?.titulo,
    itens: pedido.pedido_itens,
  })
  const emAberto = pedido.status !== 'cancelado' && ['pendente', 'cobrado'].includes(pedido.status_pagamento)

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/pedidos" className="text-sm font-medium text-volt-700 hover:text-ink print:hidden">‹ Pedidos</Link>
          <p className="tipo-dado text-[13px] text-suave">{formatarDataHora(pedido.criado_em)}</p>
          <h1 className="tipo-h2 sm:tipo-h1">{numeroPedido(pedido.numero)}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CanalBadge canal={pedido.canal} />
            <PagamentoBadge status={pedido.status_pagamento} />
            {pedido.pre_vendas && (
              <Link href={`/pre-vendas/${pedido.pre_vendas.id}`} className="text-[13px] font-medium text-suave underline-offset-2 hover:underline">
                {pedido.pre_vendas.titulo}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <SeletorStatus pedidoId={pedido.id} status={pedido.status} />
          <PrintButton><Printer /> Imprimir</PrintButton>
          {emAberto && <BotaoCobrar pedidoId={pedido.id} href={linkCobranca} tamanho="md" rotulo="Cobrar no WhatsApp" />}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader titulo="Itens" descricao={`${pedido.pedido_itens.reduce((s, i) => s + i.quantidade, 0)} unidade(s)`} />
            <Table>
              <THead>
                <TR>
                  <TH>Produto</TH>
                  <TH className="text-right">Qtd.</TH>
                  <TH className="text-right">Unitário</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {pedido.pedido_itens.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-medium">{i.descricao}</TD>
                    <TD className="tipo-dado text-right">{i.quantidade}</TD>
                    <TD className="tipo-dado text-right">{formatarMoeda(i.preco_unitario)}</TD>
                    <TD className="tipo-dado text-right">{formatarMoeda(i.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <dl className="space-y-1.5 border-t border-linha px-5 py-4 text-sm">
              <div className="flex justify-between"><dt className="text-suave">Subtotal</dt><dd className="tipo-dado">{formatarMoeda(pedido.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-suave">Entrega</dt><dd className="tipo-dado">{formatarMoeda(pedido.taxa_entrega)}</dd></div>
              {Number(pedido.desconto) > 0 && (
                <div className="flex justify-between"><dt className="text-suave">Desconto</dt><dd className="tipo-dado">− {formatarMoeda(pedido.desconto)}</dd></div>
              )}
              <div className="flex items-baseline justify-between pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="tipo-numero text-2xl">{formatarMoeda(pedido.total)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="print:hidden">
            <CardHeader
              titulo="Pagamento"
              descricao={
                pedido.status_pagamento === 'pago'
                  ? `Pago em ${formatarDataHora(pedido.pago_em)}${pedido.forma_pagamento ? ` · ${pedido.forma_pagamento}` : ''}`
                  : pedido.cobrancas_enviadas > 0
                    ? `${pedido.cobrancas_enviadas} cobrança(s) enviada(s) · última em ${formatarDataHora(pedido.ultima_cobranca_em)}`
                    : 'Nenhuma cobrança enviada ainda.'
              }
            />
            <CardContent>
              <ControlePagamento pedidoId={pedido.id} status={pedido.status_pagamento} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader titulo="Cliente" />
            <CardContent className="space-y-3 text-sm">
              {cliente && (
                <Link href={`/clientes/${cliente.id}`} className="block text-base font-semibold hover:text-volt-700">
                  {cliente.nome}
                </Link>
              )}
              <p className="flex items-center gap-2.5"><Phone className="size-4 text-suave" aria-hidden /> {formatarWhatsapp(cliente?.whatsapp)}</p>
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-suave" aria-hidden />
                {formatarEndereco(endereco) || 'Sem endereço de entrega'}
              </p>
              {endereco?.referencia && <p className="text-[13px] text-suave">Ref.: {endereco.referencia}</p>}
              {pedido.observacoes && <p className="rounded-xl bg-papel p-3 text-[13px]">{pedido.observacoes}</p>}
              {cliente?.whatsapp && (
                <ButtonExternal
                  href={linkWhatsapp(cliente.whatsapp, `Oi, ${primeiroNome(cliente.nome)}! Sobre o pedido ${numeroPedido(pedido.numero)}...`)}
                  bloco
                  className="print:hidden"
                >
                  <MessageCircle /> Conversar
                </ButtonExternal>
              )}
            </CardContent>
          </Card>

          <Card className="print:hidden">
            <CardHeader titulo="Linha do tempo" />
            <CardContent>
              <LinhaDoTempo atividades={atividades} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
