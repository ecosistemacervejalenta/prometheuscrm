/**
 * Texto da prévia do link da pré-venda (WhatsApp, Instagram...). É padrão para todas:
 * o nome da cerveja no título (o mesmo produto da foto) e a mensagem do Grupo VIP na descrição.
 * O título e a descrição internos da pré-venda ficam só dentro da página.
 */

export const SEGURANCA_PREVIA = '🔒 Compra segura e dados protegidos.'
export const ASSINATURA_PREVIA = 'Tecnologia feita pelo Ecossistema Cerveja Lenta.'

const MAX_TITULO = 90

/**
 * Nome da Olist → nome de vitrine: tira o "Cerveja" do começo, o volume e o teor.
 * "Cerveja Dogma Hop Lover Double IPA 355ml 8,4%" → "Dogma Hop Lover Double IPA".
 */
export function nomeDeVitrine(nome: string) {
  const limpo = nome
    .replace(/^\s*cervejas?\s+/i, '')
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:ml|l)\b/gi, '')
    .replace(/\d+(?:[.,]\d+)?\s?%/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–·,|]+|[\s\-–·,|]+$/g, '')
  return limpo || nome.trim()
}

const cortar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto)

type DadosDaPrevia = {
  preVenda: { titulo: string; grupoVip: boolean }
  itens: { nome: string }[]
}

export function textoDaPrevia({ preVenda, itens }: DadosDaPrevia) {
  const nomes = [...new Set(itens.map((i) => nomeDeVitrine(i.nome)).filter(Boolean))]
  const cervejas =
    nomes.length === 0
      ? preVenda.titulo.trim() || 'Pré-venda'
      : nomes.length === 1
        ? nomes[0]
        : nomes.length === 2
          ? `${nomes[0]} + ${nomes[1]}`
          : `${nomes[0]} + ${nomes[1]} e mais ${nomes.length - 2}`

  const chamada = preVenda.grupoVip ? 'Link exclusivo do Grupo VIP para pedidos.' : 'Link exclusivo da pré-venda para pedidos.'

  return {
    titulo: cortar(`🍺 ${cervejas}`, MAX_TITULO),
    descricao: `${chamada} ${SEGURANCA_PREVIA} ${ASSINATURA_PREVIA}`,
  }
}
