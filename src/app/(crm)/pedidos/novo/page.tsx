import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { obterClienteParaEdicao } from '@/features/clientes/queries'
import { criarPedidoManual } from '@/features/pedidos/actions'
import { FormularioPedido } from '@/features/pedidos/components/formulario-pedido'
import { itensDaPreVenda, listarPreVendasAtivas } from '@/features/pre-vendas/queries'
import { opcoesProdutos } from '@/features/produtos/queries'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Novo pedido' }

function detalhe(p: { estilo: string | null; volume_ml: number | null }) {
  return [p.estilo, p.volume_ml ? `${p.volume_ml} ml` : null].filter(Boolean).join(' · ') || 'Cerveja'
}

export default async function PaginaNovoPedido({ searchParams }: PageProps<'/pedidos/novo'>) {
  const busca = await searchParams
  const clienteId = param(busca.cliente)
  const preVendaInicial = param(busca.pre_venda)

  const [cliente, ativas, produtos] = await Promise.all([
    clienteId ? obterClienteParaEdicao(clienteId) : Promise.resolve(null),
    listarPreVendasAtivas(),
    opcoesProdutos(),
  ])

  const preVendas = await Promise.all(
    ativas.map(async (pv) => ({
      id: pv.id ?? '',
      titulo: pv.titulo ?? '',
      canal: pv.canal ?? 'grupo_vip',
      taxa_entrega: Number(pv.taxa_entrega ?? 0),
      itens: (await itensDaPreVenda(pv.id ?? '')).map((i) => ({
        produto_id: i.produto_id ?? '',
        nome: i.nome ?? '',
        detalhe: detalhe(i) + (i.restante !== null ? ` · restam ${i.restante}` : ''),
        preco: Number(i.preco ?? 0),
      })),
    })),
  )

  return (
    <>
      <PageHeader
        titulo="Novo pedido"
        descricao="Para vendas combinadas por mensagem, no balcão ou no grupo."
        voltar={{ href: '/pedidos', rotulo: 'Pedidos' }}
      />
      <FormularioPedido
        acao={criarPedidoManual}
        clienteInicial={
          cliente
            ? { id: cliente.id, nome: cliente.nome, whatsapp: cliente.whatsapp, logradouro: cliente.logradouro, vip: cliente.vip }
            : null
        }
        preVendas={preVendas}
        preVendaInicial={preVendaInicial}
        produtosAvulsos={produtos.map((p) => ({ produto_id: p.id, nome: p.nome, detalhe: detalhe(p), preco: Number(p.preco) }))}
      />
    </>
  )
}
