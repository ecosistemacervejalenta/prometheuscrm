import { formatarData, formatarMoeda, numeroPedido } from './format'

/**
 * Normaliza um número para o padrão internacional só com dígitos
 * (mesma regra da função SQL `normalizar_whatsapp`).
 *   "(11) 98765-4321" → "5511987654321"
 */
export function normalizarWhatsapp(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (!digitos) return null
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos
}

export function whatsappValido(numero: string | null | undefined): boolean {
  const n = normalizarWhatsapp(numero)
  return Boolean(n && n.length >= 12 && n.length <= 15)
}

/** Máscara para digitação: 11987654321 → (11) 98765-4321 */
export function mascararWhatsapp(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Link "clique para conversar" do WhatsApp.
 * Sem número, abre o seletor de conversas (ideal para disparar no grupo VIP).
 */
export function linkWhatsapp(numero: string | null | undefined, texto?: string): string {
  const destino = normalizarWhatsapp(numero) ?? ''
  const query = texto ? `?text=${encodeURIComponent(texto)}` : ''
  return `https://wa.me/${destino}${query}`
}

/** Substitui {chaves} do modelo pelos valores. Linhas que ficam vazias são removidas. */
export function preencherModelo(modelo: string, valores: Record<string, string | null | undefined>): string {
  return modelo
    .replace(/\{(\w+)\}/g, (_, chave: string) => valores[chave] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Placeholders aceitos em cada modelo (exibidos na tela de configurações). */
export const PLACEHOLDERS = {
  pre_venda: ['{titulo}', '{descricao}', '{link}', '{encerra_em}', '{entrega}'],
  cobranca: ['{nome}', '{pedido}', '{pre_venda}', '{itens}', '{total}', '{pagamento}', '{pix}'],
} as const

type ConfigMensagens = {
  mensagem_pre_venda: string
  mensagem_cobranca: string
  chave_pix: string | null
  nome_recebedor_pix: string | null
}

export function mensagemPreVenda(
  config: Pick<ConfigMensagens, 'mensagem_pre_venda'>,
  preVenda: { titulo: string; descricao: string | null; encerra_em: string | null; previsao_entrega: string | null },
  link: string,
): string {
  return preencherModelo(config.mensagem_pre_venda, {
    titulo: preVenda.titulo,
    descricao: preVenda.descricao,
    link,
    encerra_em: preVenda.encerra_em ? formatarData(preVenda.encerra_em) : '',
    entrega: preVenda.previsao_entrega ? formatarData(preVenda.previsao_entrega) : '',
  })
}

export function textoPagamento(config: Pick<ConfigMensagens, 'chave_pix' | 'nome_recebedor_pix'>): string {
  if (!config.chave_pix) return ''
  const recebedor = config.nome_recebedor_pix ? `\nFavorecido: ${config.nome_recebedor_pix}` : ''
  return `💸 *PIX:* ${config.chave_pix}${recebedor}`
}

export function mensagemCobranca(
  config: ConfigMensagens,
  pedido: {
    numero: number
    total: number
    taxa_entrega: number
    cliente_nome: string
    pre_venda_titulo?: string | null
    itens: Array<{ descricao: string; quantidade: number; total: number }>
  },
): string {
  const itens = pedido.itens.map((i) => `• ${i.quantidade}× ${i.descricao} — ${formatarMoeda(i.total)}`)
  if (Number(pedido.taxa_entrega) > 0) itens.push(`• Entrega — ${formatarMoeda(pedido.taxa_entrega)}`)

  return preencherModelo(config.mensagem_cobranca, {
    nome: pedido.cliente_nome.split(' ')[0],
    pedido: numeroPedido(pedido.numero).replace('#', ''),
    pre_venda: pedido.pre_venda_titulo ? ` (${pedido.pre_venda_titulo})` : '',
    itens: itens.join('\n'),
    total: formatarMoeda(pedido.total),
    pagamento: textoPagamento(config),
    pix: config.chave_pix ?? '',
  })
}

/** Frete cotado de um pedido do link (CEP fora da lista VIP), com os dados do PIX. */
export function mensagemFrete(
  config: Pick<ConfigMensagens, 'chave_pix' | 'nome_recebedor_pix'>,
  pedido: { numero: number; total: number; taxa_entrega: number; cliente_nome: string; pre_venda_titulo?: string | null },
): string {
  const titulo = pedido.pre_venda_titulo ? ` (${pedido.pre_venda_titulo})` : ''
  return preencherModelo(
    [
      `Olá, ${pedido.cliente_nome.split(' ')[0]}! Tudo bem? 🍺`,
      '',
      `Cotamos o frete do seu pedido *${numeroPedido(pedido.numero)}*${titulo}: *${formatarMoeda(pedido.taxa_entrega)}*.`,
      `Total do pedido com frete: *${formatarMoeda(pedido.total)}*.`,
      '',
      '{pagamento}',
      '',
      'Se você já pagou as cervejas, é só pagar o frete e mandar o comprovante por aqui. Obrigado! 🙌',
    ].join('\n'),
    { pagamento: textoPagamento(config) },
  )
}
