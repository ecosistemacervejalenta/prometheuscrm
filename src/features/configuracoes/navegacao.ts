import {
  Boxes,
  Braces,
  CircleUserRound,
  CreditCard,
  Megaphone,
  MessageSquareText,
  MessagesSquare,
  PackageOpen,
  QrCode,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tags,
  Truck,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

/**
 * Mapa das Configurações: cada seção é uma página com um único assunto.
 * O menu lateral, a visão geral e o cabeçalho de cada página saem daqui —
 * para criar uma seção nova, acrescente-a aqui e crie a rota em `src/app/(crm)/configuracoes`.
 */

export type ChaveSecao =
  | 'loja'
  | 'mensagens'
  | 'pagamento'
  | 'frete'
  | 'caixa-vip'
  | 'whatsapp'
  | 'atendimento'
  | 'etiquetas'
  | 'olist'
  | 'shopify'
  | 'mercado-pago'
  | 'mercado-livre'
  | 'shopee'
  | 'whatsapp-oficial'
  | 'webhooks'
  | 'api'
  | 'perfil'
  | 'equipe'

export type Secao = {
  chave: ChaveSecao
  href: string
  rotulo: string
  /** Uma linha dizendo o que se ajusta ali (visão geral e cabeçalho da página). */
  descricao: string
  icone: LucideIcon
}

export type GrupoSecoes = { titulo: string; secoes: Secao[] }

export const INICIO_CONFIGURACOES = '/configuracoes'

const secao = (chave: ChaveSecao, rotulo: string, descricao: string, icone: LucideIcon): Secao => ({
  chave,
  href: `${INICIO_CONFIGURACOES}/${chave}`,
  rotulo,
  descricao,
  icone,
})

export const GRUPOS_CONFIGURACOES: GrupoSecoes[] = [
  {
    titulo: 'Loja',
    secoes: [
      secao('loja', 'Dados da loja', 'Nome e WhatsApp que aparecem para o cliente.', Store),
      secao('mensagens', 'Mensagens', 'Textos de divulgação e de cobrança enviados pelo WhatsApp.', MessageSquareText),
    ],
  },
  {
    titulo: 'Pré-venda e Grupo VIP',
    secoes: [
      secao('pagamento', 'Pagamento por PIX', 'Chave PIX da loja e para onde vão os comprovantes.', QrCode),
      secao('frete', 'Frete VIP', 'Lista de CEPs com frete fixo e o valor cobrado.', Truck),
      secao('caixa-vip', 'Caixa VIP', 'Prazo para cancelar a caixa que não foi paga.', PackageOpen),
    ],
  },
  {
    titulo: 'Atendimento',
    secoes: [
      secao('whatsapp', 'WhatsApp da loja', 'Número que recebe as conversas do Atendimento.', MessagesSquare),
      secao('atendimento', 'Preferências', 'Rodízio da fila, assinatura das mensagens e Banco de Leads.', SlidersHorizontal),
      secao('etiquetas', 'Etiquetas', 'Marcadores que dizem o que está sendo tratado em cada conversa.', Tags),
    ],
  },
  {
    titulo: 'Conexões',
    secoes: [
      secao('olist', 'Olist ERP', 'Vendas por canal e estoque das cervejas das pré-vendas.', Boxes),
      secao('shopify', 'Shopify', 'Pedidos e clientes da loja virtual entram no CRM.', ShoppingBag),
      secao('mercado-pago', 'Mercado Pago', 'PIX com QR Code e baixa automática do pedido.', CreditCard),
      secao('mercado-livre', 'Mercado Livre', 'Tarifas, frete e valor líquido de cada venda.', ShoppingCart),
      secao('shopee', 'Shopee', 'Comissão, taxas e repasse final de cada pedido.', ShoppingCart),
      secao('whatsapp-oficial', 'WhatsApp oficial', 'Número da Meta usado só para as Campanhas.', Megaphone),
    ],
  },
  {
    titulo: 'Automação',
    secoes: [
      secao('webhooks', 'Webhooks', 'Avisos enviados ao n8n, Zapier ou App a cada evento do CRM.', Webhook),
      secao('api', 'API', 'Rotas para automações lerem e atualizarem o CRM.', Braces),
    ],
  },
  {
    titulo: 'Pessoas',
    secoes: [
      secao('perfil', 'Meu perfil', 'Seu nome, cargo, foto e WhatsApp pessoal.', CircleUserRound),
      secao('equipe', 'Equipe', 'Quem acessa o CRM e com qual permissão.', Users),
    ],
  },
]

const TODAS = GRUPOS_CONFIGURACOES.flatMap((grupo) => grupo.secoes.map((s) => ({ ...s, grupo: grupo.titulo })))

/** Seção + o grupo a que pertence (para o cabeçalho da página). */
export function obterSecao(chave: ChaveSecao) {
  const achada = TODAS.find((s) => s.chave === chave)
  if (!achada) throw new Error(`Seção de configurações desconhecida: ${chave}`)
  return achada
}

export const hrefSecao = (chave: ChaveSecao) => `${INICIO_CONFIGURACOES}/${chave}`
