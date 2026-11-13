import type { PedidoComItens } from '../pedidos/queries'

export type LinhaResumo = { chave: string; descricao: string; quantidade: number; total: number; pedidos: number }

/** Itens do pedido que contam no relatório: com pré-venda escolhida, só os dela (uma Caixa VIP junta várias). */
export function itensQueContam(pedido: PedidoComItens, preVendaId?: string) {
  return preVendaId ? pedido.pedido_itens.filter((i) => i.pre_venda_id === preVendaId) : pedido.pedido_itens
}

/** Consolida as unidades vendidas por cerveja (modelo) a partir dos pedidos filtrados. */
export function resumirPorCerveja(pedidos: PedidoComItens[], preVendaId?: string): LinhaResumo[] {
  const mapa = new Map<string, LinhaResumo & { idsPedidos: Set<string> }>()
  for (const pedido of pedidos) {
    for (const item of itensQueContam(pedido, preVendaId)) {
      const chave = item.produto_id ?? item.descricao
      const linha = mapa.get(chave) ?? {
        chave,
        descricao: item.descricao,
        quantidade: 0,
        total: 0,
        pedidos: 0,
        idsPedidos: new Set<string>(),
      }
      linha.quantidade += item.quantidade
      linha.total += Number(item.total)
      linha.idsPedidos.add(pedido.id)
      linha.pedidos = linha.idsPedidos.size
      mapa.set(chave, linha)
    }
  }
  return [...mapa.values()]
    .map((linha) => ({
      chave: linha.chave,
      descricao: linha.descricao,
      quantidade: linha.quantidade,
      total: linha.total,
      pedidos: linha.pedidos,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.descricao.localeCompare(b.descricao))
}

/**
 * Totais dos pedidos. Com pré-venda escolhida, os valores são só das cervejas dela
 * (sem frete): uma Caixa VIP pode ter itens de outras pré-vendas.
 */
export function totaisDosPedidos(pedidos: PedidoComItens[], preVendaId?: string) {
  return pedidos.reduce(
    (t, p) => {
      const itens = itensQueContam(p, preVendaId)
      const valor = preVendaId ? itens.reduce((s, i) => s + Number(i.total), 0) : Number(p.total)
      t.pedidos++
      t.unidades += itens.reduce((s, i) => s + i.quantidade, 0)
      t.faturado += valor
      if (p.status_pagamento === 'pago') t.recebido += valor
      if (p.status_pagamento === 'pendente' || p.status_pagamento === 'cobrado') {
        t.aReceber += valor
        t.emAberto++
      }
      if (p.caixa === 'aberta') t.caixasAbertas++
      return t
    },
    { pedidos: 0, unidades: 0, faturado: 0, recebido: 0, aReceber: 0, emAberto: 0, caixasAbertas: 0 },
  )
}
