import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Send, ShoppingBag } from 'lucide-react'

import { LinhaDoTempo } from '@/components/dominio/linha-do-tempo'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ButtonExternal, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { atividadesDoCliente, obterCliente, pedidosDoCliente } from '@/features/clientes/queries'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { CanalBadge, PagamentoBadge } from '@/features/pedidos/components/selos'
import { listarPreVendasAtivas } from '@/features/pre-vendas/queries'
import {
  formatarData,
  formatarEndereco,
  formatarMesAno,
  formatarMoeda,
  formatarNumero,
  formatarRelativo,
  formatarWhatsapp,
  numeroPedido,
  primeiroNome,
} from '@/lib/format'
import { ORIGEM_CLIENTE } from '@/lib/rotulos'
import { linkPreVenda } from '@/lib/url'
import { linkWhatsapp, mensagemPreVenda } from '@/lib/whatsapp'

export async function generateMetadata({ params }: PageProps<'/clientes/[id]'>): Promise<Metadata> {
  const cliente = await obterCliente((await params).id)
  return { title: cliente?.nome ?? 'Cliente' }
}

export default async function PaginaCliente({ params }: PageProps<'/clientes/[id]'>) {
  const { id } = await params
  const [cliente, pedidos, atividades, preVendas, config] = await Promise.all([
    obterCliente(id),
    pedidosDoCliente(id),
    atividadesDoCliente(id),
    listarPreVendasAtivas(),
    obterConfiguracoes(),
  ])
  if (!cliente?.id) notFound()

  const totalPedidos = cliente.pedidos ?? 0
  const ticket = totalPedidos > 0 ? Number(cliente.total_gasto) / totalPedidos : 0
  const endereco = formatarEndereco(cliente)
  const links = await Promise.all(
    preVendas.map(async (pv) => {
      const link = `${await linkPreVenda(pv.slug ?? '')}?w=${cliente.whatsapp ?? ''}`
      const texto = `Oi, ${primeiroNome(cliente.nome)}! ` + mensagemPreVenda(config, {
        titulo: pv.titulo ?? '',
        descricao: pv.descricao,
        encerra_em: pv.encerra_em,
        previsao_entrega: pv.previsao_entrega,
      }, link)
      return { id: pv.id, titulo: pv.titulo, href: linkWhatsapp(cliente.whatsapp, texto) }
    }),
  )

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar nome={cliente.nome} tamanho="lg" variante="volt" />
          <div className="min-w-0">
            <Link href="/clientes" className="text-sm font-medium text-volt-700 hover:text-ink">
              ‹ Clientes
            </Link>
            <h1 className="tipo-h2 sm:tipo-h1 break-words">{cliente.nome}</h1>
            <p className="tipo-dado text-[13px] text-suave">
              cliente desde {cliente.criado_em ? formatarMesAno(cliente.criado_em) : '—'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {cliente.whatsapp && (
            <ButtonExternal href={linkWhatsapp(cliente.whatsapp, `Oi, ${primeiroNome(cliente.nome)}!`)} variante="whatsapp">
              <MessageCircle /> Mensagem
            </ButtonExternal>
          )}
          <ButtonLink href={`/clientes/${id}/editar`}>
            <Pencil /> Editar
          </ButtonLink>
          <ButtonLink href={`/pedidos/novo?cliente=${id}`} variante="primario">
            <Plus /> Novo pedido
          </ButtonLink>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {cliente.vip && <Badge tom="escuro">VIP</Badge>}
        {cliente.origem && <Badge tom={ORIGEM_CLIENTE[cliente.origem].tom}>Origem: {ORIGEM_CLIENTE[cliente.origem].rotulo}</Badge>}
        {cliente.shopify_customer_id && <Badge tom="shopify">Shopify</Badge>}
        {cliente.tags?.map((t) => <Badge key={t}>{t}</Badge>)}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="LTV" valor={formatarMoeda(cliente.total_gasto)} />
        <Kpi rotulo="Pedidos" valor={formatarNumero(totalPedidos)} detalhe={cliente.ultimo_pedido_em ? `último ${formatarRelativo(cliente.ultimo_pedido_em)}` : undefined} />
        <Kpi rotulo="Ticket médio" valor={formatarMoeda(ticket)} />
        <Kpi
          rotulo="Em aberto"
          valor={formatarMoeda(cliente.em_aberto)}
          tendencia={Number(cliente.em_aberto) > 0 ? 'negativa' : 'neutra'}
          detalhe={Number(cliente.em_aberto) > 0 ? 'aguardando pagamento' : 'tudo pago'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0 self-start">
          <CardHeader titulo="Pedidos" descricao={`${formatarNumero(totalPedidos)} no total`} />
          {pedidos.length === 0 ? (
            <EmptyState icone={ShoppingBag} titulo="Nenhum pedido ainda" acao={<ButtonLink href={`/pedidos/novo?cliente=${id}`}>Lançar pedido</ButtonLink>} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Pedido</TH>
                  <TH>Canal</TH>
                  <TH>Data</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Pagamento</TH>
                </TR>
              </THead>
              <TBody>
                {pedidos.map((p) => (
                  <TR key={p.id} className="hover:bg-papel/60">
                    <TD>
                      <Link href={`/pedidos/${p.id}`} className="tipo-dado font-semibold hover:text-volt-700">
                        {numeroPedido(p.numero)}
                      </Link>
                      {p.pre_venda_titulo && <p className="text-[12px] text-suave">{p.pre_venda_titulo}</p>}
                    </TD>
                    <TD><CanalBadge canal={p.canal} /></TD>
                    <TD className="tipo-dado text-[13px] text-suave">{formatarData(p.criado_em)}</TD>
                    <TD className="tipo-dado text-right">{formatarMoeda(p.total)}</TD>
                    <TD><PagamentoBadge status={p.status_pagamento} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader titulo="Contato e entrega" />
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2.5"><Phone className="size-4 text-suave" aria-hidden /> {formatarWhatsapp(cliente.whatsapp)}</p>
              <p className="flex items-center gap-2.5"><Mail className="size-4 text-suave" aria-hidden /> {cliente.email ?? '—'}</p>
              <p className="flex items-start gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-suave" aria-hidden /> {endereco || 'Sem endereço cadastrado'}</p>
              {cliente.referencia && <p className="pl-6.5 text-[13px] text-suave">Ref.: {cliente.referencia}</p>}
              {cliente.observacoes && <p className="rounded-xl bg-papel p-3 text-[13px] text-suave">{cliente.observacoes}</p>}
            </CardContent>
          </Card>

          {cliente.whatsapp && links.length > 0 && (
            <Card>
              <CardHeader titulo="Enviar pré-venda" descricao="Link já identifica o cliente pelo WhatsApp." />
              <CardContent className="space-y-2">
                {links.map((l) => (
                  <ButtonExternal key={l.id} href={l.href} bloco variante="secundario" className="justify-between">
                    <span className="truncate">{l.titulo}</span> <Send />
                  </ButtonExternal>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
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
