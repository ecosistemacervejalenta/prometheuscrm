/**
 * Simulação de um pedido com cupom de influenciador — a MESMA conta que vale de verdade:
 *   • a Shopify aplica o % do cupom sobre o total dos produtos e arredonda PARA BAIXO no centavo
 *     (alocação "across"; conferido em 6 pedidos reais da loja — scripts/testar-simulacao.mjs);
 *   • a comissão incide sobre os produtos depois do desconto, sem o frete
 *     (registrar_venda_influenciador: round(base × percentual / 100, 2)).
 * Funções puras: usadas na tela de cadastro e testáveis isoladamente.
 */

export type ItemSimulado = {
  /** Identifica a linha (variante da loja ou item de um pedido). */
  chave: string
  titulo: string
  preco: number
  quantidade: number
  imagem?: string | null
  sku?: string | null
}

export type ResultadoDaSimulacao = {
  unidades: number
  /** Produtos a preço de loja. */
  produtos: number
  /** Desconto do cupom (o cliente economiza). */
  desconto: number
  /** O que o cliente paga pelos produtos (base da comissão). */
  clientePaga: number
  comissao: number
  /** O que fica para a loja: produtos − desconto − comissão (antes do custo das cervejas e do frete). */
  loja: number
  /** Desconto + comissão. */
  custoDoPrograma: number
  /** Desconto + comissão sobre o valor dos produtos (0 a 1). */
  custoDoProgramaFracao: number
}

const centavos = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100
/** Arredonda para baixo no centavo, sem cair no erro de ponto flutuante (11,97 × 100 = 1196,9999…). */
const centavosParaBaixo = (valor: number) => Math.floor(Number((valor * 100).toFixed(6))) / 100

/** "12,5" | "12.5" | "" → número (NaN quando não dá para ler). */
export function lerPercentual(texto: string): number {
  const limpo = texto.replace(/[%\s]/g, '').replace(',', '.')
  return limpo === '' ? NaN : Number(limpo)
}

const percentualValido = (p: number) => (Number.isFinite(p) ? Math.min(Math.max(p, 0), 100) : 0)

export function simularPedido(itens: ItemSimulado[], descontoPercentual: number, comissaoPercentual: number): ResultadoDaSimulacao {
  const desconto = percentualValido(descontoPercentual) / 100
  const comissao = percentualValido(comissaoPercentual) / 100

  let produtos = 0
  let unidades = 0
  for (const item of itens) {
    produtos += centavos(item.preco * item.quantidade)
    unidades += item.quantidade
  }
  produtos = centavos(produtos)
  const descontoTotal = centavosParaBaixo(produtos * desconto)

  const clientePaga = centavos(produtos - descontoTotal)
  const valorComissao = centavos(clientePaga * comissao)
  const loja = centavos(clientePaga - valorComissao)
  const custoDoPrograma = centavos(descontoTotal + valorComissao)

  return {
    unidades,
    produtos,
    desconto: descontoTotal,
    clientePaga,
    comissao: valorComissao,
    loja,
    custoDoPrograma,
    custoDoProgramaFracao: produtos > 0 ? custoDoPrograma / produtos : 0,
  }
}

/** Texto sem acento e em minúsculas, para a busca de produtos. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Todas as palavras digitadas precisam aparecer (em qualquer ordem) no nome ou no SKU. */
export function combinaComBusca(alvo: string, termo: string): boolean {
  const palavras = normalizarBusca(termo).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return false
  const texto = normalizarBusca(alvo)
  return palavras.every((p) => texto.includes(p))
}
