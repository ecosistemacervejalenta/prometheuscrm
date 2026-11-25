/**
 * Caixa VIP vista pelo cliente (link da pré-venda e /pagar): o JSON de caixa_publica()
 * convertido para números e listas seguras. Sem endereço completo — só bairro e cidade.
 */

export type ItemDaCaixa = {
  descricao: string
  quantidade: number
  total: number
  preVendaId: string | null
  preVendaTitulo: string | null
  previsaoEntrega: string | null
  imagemUrl: string | null
}

export type CaixaPublica = {
  pedidoId: string
  numero: number
  /** 'aberta' = o cliente ainda está montando; 'fechada' = para pagar ou paga. */
  situacao: 'aberta' | 'fechada' | null
  status: string
  statusPagamento: string
  frete: 'vip' | 'a_cotar' | 'cotado' | null
  /** Frete calculado sozinho pelo peso da caixa (Olist Envios): é refeito quando entram cervejas. */
  freteCalculado: boolean
  subtotal: number
  taxaEntrega: number
  desconto: number
  total: number
  pago: number
  devido: number
  unidades: number
  previsaoEnvio: string | null
  cliente: { primeiroNome: string; temEmail: boolean; cidade: string | null; uf: string | null; bairro: string | null }
  itens: ItemDaCaixa[]
}

export type GrupoDaCaixa = { chave: string; titulo: string; previsao: string | null; itens: ItemDaCaixa[] }

const numero = (v: unknown) => Number(v ?? 0) || 0
const texto = (v: unknown) => (typeof v === 'string' && v ? v : null)

export function lerCaixa(json: unknown): CaixaPublica | null {
  if (!json || typeof json !== 'object') return null
  const c = json as Record<string, unknown>
  if (typeof c.pedido_id !== 'string') return null
  const cliente = (c.cliente ?? {}) as Record<string, unknown>
  const itens = Array.isArray(c.itens) ? (c.itens as Array<Record<string, unknown>>) : []
  return {
    pedidoId: c.pedido_id,
    numero: numero(c.numero),
    situacao: c.caixa === 'aberta' || c.caixa === 'fechada' ? c.caixa : null,
    status: String(c.status ?? ''),
    statusPagamento: String(c.status_pagamento ?? ''),
    frete: c.frete === 'vip' || c.frete === 'a_cotar' || c.frete === 'cotado' ? c.frete : null,
    freteCalculado: c.frete === 'cotado' && c.frete_calculado === true,
    subtotal: numero(c.subtotal),
    taxaEntrega: numero(c.taxa_entrega),
    desconto: numero(c.desconto),
    total: numero(c.total),
    pago: numero(c.pago),
    devido: numero(c.devido),
    unidades: numero(c.unidades),
    previsaoEnvio: texto(c.previsao_envio),
    cliente: {
      primeiroNome: String(cliente.primeiro_nome ?? ''),
      temEmail: cliente.tem_email === true,
      cidade: texto(cliente.cidade),
      uf: texto(cliente.uf),
      bairro: texto(cliente.bairro),
    },
    itens: itens.map((i) => ({
      descricao: String(i.descricao ?? ''),
      quantidade: numero(i.quantidade),
      total: numero(i.total),
      preVendaId: texto(i.pre_venda_id),
      preVendaTitulo: texto(i.pre_venda_titulo),
      previsaoEntrega: texto(i.previsao_entrega),
      imagemUrl: texto(i.imagem_url),
    })),
  }
}

/** Itens agrupados por pré-venda, na ordem em que entraram na caixa. */
export function gruposDaCaixa(itens: ItemDaCaixa[]): GrupoDaCaixa[] {
  const grupos = new Map<string, GrupoDaCaixa>()
  for (const item of itens) {
    const chave = item.preVendaId ?? 'outros'
    const grupo = grupos.get(chave) ?? { chave, titulo: item.preVendaTitulo ?? 'Outros itens', previsao: item.previsaoEntrega, itens: [] }
    grupo.itens.push(item)
    grupos.set(chave, grupo)
  }
  return [...grupos.values()]
}

/** A caixa já foi paga por inteiro (não falta nada). */
export const caixaQuitada = (c: CaixaPublica) => c.statusPagamento === 'pago' || (c.devido <= 0 && c.frete !== 'a_cotar')
