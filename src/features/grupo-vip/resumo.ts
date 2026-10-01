import type { PedidoComItens } from '../pedidos/queries'

export type LinhaResumo = { chave: string; descricao: string; quantidade: number; total: number; pedidos: number }

/** Consolida as unidades vendidas por cerveja (modelo) a partir dos pedidos filtrados. */
export function resumirPorCerveja(pedidos: PedidoComItens[]): LinhaResumo[] {
  const mapa = new Map<string, LinhaResumo & { idsPedidos: Set<string> }>()
  for (const pedido of pedidos) {
    for (const item of pedido.pedido_itens) {
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

export function totaisDosPedidos(pedidos: PedidoComItens[]) {
  return pedidos.reduce(
    (t, p) => {
      t.pedidos++
      t.unidades += p.pedido_itens.reduce((s, i) => s + i.quantidade, 0)
      t.faturado += Number(p.total)
      if (p.status_pagamento === 'pago') t.recebido += Number(p.total)
      if (p.status_pagamento === 'pendente' || p.status_pagamento === 'cobrado') {
        t.aReceber += Number(p.total)
        t.emAberto++
      }
      return t
    },
    { pedidos: 0, unidades: 0, faturado: 0, recebido: 0, aReceber: 0, emAberto: 0 },
  )
}
