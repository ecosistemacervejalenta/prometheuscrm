import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Send } from 'lucide-react'

import { LinhaDoTempo } from '@/components/dominio/linha-do-tempo'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ButtonExternal, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Kpi } from '@/components/ui/kpi'
import { HistoricoDePedidos } from '@/features/clientes/components/historico-pedidos'
import { atividadesDoCliente, historicoDoCliente, obterCliente } from '@/features/clientes/queries'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { ComprasNaLoja } from '@/features/estilos/components/compras-na-loja'
import { comprasNaLoja } from '@/features/estilos/queries'
import { listarPreVendasAtivas } from '@/features/pre-vendas/queries'
import {
  formatarEndereco,
  formatarMesAno,
  formatarMoeda,
  formatarNumero,
  formatarRelativo,
  formatarWhatsapp,
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
  const [cliente, { pedidos, totais }, atividades, preVendas, config, naLoja] = await Promise.all([
    obterCliente(id),
    historicoDoCliente(id),
    atividadesDoCliente(id),
    listarPreVendasAtivas(),
    obterConfiguracoes(),
    comprasNaLoja(id),
  ])
  if (!cliente?.id) notFound()

  // Compras pagas na loja da Shopify entram nos totais (pagas = sem nada em aberto).
  const loja = naLoja.totais
  const comprado = totais.comprado + loja.valor
  const pago = totais.pago + loja.valor
  const unidades = totais.unidades + loja.unidades
  const qtdPedidos = totais.pedidos + loja.pedidos
  const ticket = qtdPedidos > 0 ? comprado / qtdPedidos : 0
  const ultimo = [pedidos.find((p) => p.status !== 'cancelado')?.criadoEm, loja.ultima]
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1)
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
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 lg:mb-6">
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
        <div className="flex w-full flex-wrap gap-2 *:grow lg:w-auto lg:*:grow-0">
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
        <Kpi
          rotulo="Total comprado"
          valor={formatarMoeda(comprado)}
          detalhe={`${formatarNumero(unidades)} ${unidades === 1 ? 'item' : 'itens'}${loja.pedidos > 0 ? ` · ${formatarMoeda(loja.valor)} na loja` : ''}`}
        />
        <Kpi rotulo="Total pago" valor={formatarMoeda(pago)} tendencia={pago > 0 ? 'positiva' : 'neutra'} />
        <Kpi
          rotulo="Em aberto"
          valor={formatarMoeda(totais.emAberto)}
          tendencia={totais.emAberto > 0 ? 'negativa' : 'neutra'}
          detalhe={totais.emAberto > 0 ? 'aguardando pagamento' : 'tudo pago'}
        />
        <Kpi
          rotulo="Pedidos"
          valor={formatarNumero(qtdPedidos)}
          detalhe={
            qtdPedidos > 0
              ? `ticket ${formatarMoeda(ticket)}${ultimo ? ` · último ${formatarRelativo(ultimo)}` : ''}${loja.pedidos > 0 ? ` · ${formatarNumero(loja.pedidos)} na loja` : ''}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6 self-start">
          <ComprasNaLoja dados={naLoja} />

          <Card className="min-w-0">
            <CardHeader
              titulo={loja.pedidos > 0 ? 'Pedidos pelo CRM' : 'Histórico de compras'}
              descricao={
                pedidos.length > 0
                  ? `${formatarNumero(pedidos.length)} ${pedidos.length === 1 ? 'pedido' : 'pedidos'}, do mais novo ao mais antigo — fica guardado mesmo se a pré-venda for excluída.`
                  : loja.pedidos > 0
                    ? 'Pré-vendas e pedidos lançados pela equipe. As compras na loja estão acima.'
                    : undefined
              }
            />
            <HistoricoDePedidos pedidos={pedidos} clienteId={id} />
          </Card>
        </div>

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
