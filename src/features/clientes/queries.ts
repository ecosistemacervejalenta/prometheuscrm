import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { termoBusca } from '@/lib/utils'
import { normalizarWhatsapp } from '@/lib/whatsapp'

export const CLIENTES_POR_PAGINA = 30

export async function listarClientes({
  busca,
  vip,
  pagina = 1,
}: {
  busca?: string
  vip?: boolean
  pagina?: number
}) {
  const { supabase } = await exigirEquipe()
  const inicio = (pagina - 1) * CLIENTES_POR_PAGINA

  let consulta = supabase
    .from('vw_clientes')
    .select('*', { count: 'exact' })
    .order('ultimo_pedido_em', { ascending: false, nullsFirst: false })
    .order('nome')
    .range(inicio, inicio + CLIENTES_POR_PAGINA - 1)

  if (vip) consulta = consulta.eq('vip', true)
  if (busca) {
    const termo = termoBusca(busca)
    const digitos = busca.replace(/\D/g, '')
    const filtros = [`nome.ilike.%${termo}%`, `email.ilike.%${termo}%`]
    if (digitos.length >= 4) filtros.push(`whatsapp.ilike.%${digitos}%`)
    consulta = consulta.or(filtros.join(','))
  }

  const { data, count, error } = await consulta
  if (error) throw error
  return { clientes: data, total: count ?? 0 }
}

export async function obterCliente(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('vw_clientes').select('*').eq('id', id).maybeSingle()
  return data
}

export async function obterClienteParaEdicao(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
  return data
}

export type PedidoDoHistorico = Awaited<ReturnType<typeof historicoDoCliente>>['pedidos'][number]

/**
 * Histórico completo do cliente: TODOS os pedidos, com as cervejas de cada um, de qual
 * pré-venda vieram (o nome fica guardado mesmo se a pré-venda for excluída) e quanto já foi pago.
 * Pago = pedido quitado → total; senão, o que entrou pelo PIX + o que foi pago por fora
 * (mesma regra de saldo_pix_pedido no banco).
 */
export async function historicoDoCliente(id: string) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('pedidos')
    .select(
      `id, numero, criado_em, canal, status, status_pagamento, frete, caixa, subtotal, taxa_entrega, desconto, total, pago_fora_pix,
       pre_vendas (titulo),
       pedido_itens (id, descricao, quantidade, total, pre_venda_titulo, pre_vendas (titulo)),
       cobrancas_pix (valor_pago, status)`,
    )
    .eq('cliente_id', id)
    .order('criado_em', { ascending: false })
  if (error) throw error

  const pedidos = (data ?? []).map((p) => {
    const pagoPix = p.cobrancas_pix.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor_pago ?? 0), 0)
    const total = Number(p.total)
    const pago =
      p.status_pagamento === 'pago' ? total : p.status_pagamento === 'estornado' ? 0 : Math.min(pagoPix + Number(p.pago_fora_pix ?? 0), total)
    const itens = p.pedido_itens.map((i) => ({
      id: i.id,
      descricao: i.descricao,
      quantidade: i.quantidade,
      total: Number(i.total),
      preVenda: i.pre_vendas?.titulo ?? i.pre_venda_titulo,
    }))
    return {
      id: p.id,
      numero: p.numero,
      criadoEm: p.criado_em,
      canal: p.canal,
      status: p.status,
      statusPagamento: p.status_pagamento,
      frete: p.frete,
      caixa: p.caixa,
      taxaEntrega: Number(p.taxa_entrega),
      desconto: Number(p.desconto),
      total,
      pago,
      falta: p.status === 'cancelado' || p.status_pagamento === 'estornado' ? 0 : Math.max(total - pago, 0),
      itens,
      unidades: itens.reduce((s, i) => s + i.quantidade, 0),
      preVendas: [...new Set([p.pre_vendas?.titulo, ...itens.map((i) => i.preVenda)].filter((t): t is string => Boolean(t)))],
    }
  })

  // Pedidos cancelados aparecem no histórico, mas não contam nos totais.
  const validos = pedidos.filter((p) => p.status !== 'cancelado')
  const totais = {
    pedidos: validos.length,
    comprado: validos.reduce((s, p) => s + p.total, 0),
    pago: validos.reduce((s, p) => s + p.pago, 0),
    emAberto: validos.reduce((s, p) => s + p.falta, 0),
    unidades: validos.reduce((s, p) => s + p.unidades, 0),
  }
  return { pedidos, totais }
}

export async function atividadesDoCliente(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('atividades')
    .select('*')
    .eq('cliente_id', id)
    .order('criado_em', { ascending: false })
    .limit(200)
  return data ?? []
}

/** Busca rápida para seletores (pedido manual). */
export async function buscarClientesRapido(texto: string) {
  const { supabase } = await exigirEquipe()
  const termo = termoBusca(texto)
  if (termo.length < 2) return []
  const digitos = normalizarWhatsapp(texto)?.slice(-8)
  const filtros = [`nome.ilike.%${termo}%`]
  if (digitos && digitos.length >= 4) filtros.push(`whatsapp.ilike.%${digitos}%`)

  const { data } = await supabase
    .from('clientes')
    .select('id, nome, whatsapp, logradouro, vip')
    .or(filtros.join(','))
    .order('nome')
    .limit(8)
  return data ?? []
}
