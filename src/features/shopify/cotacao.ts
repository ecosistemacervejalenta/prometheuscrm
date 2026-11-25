/**
 * Frete pelo Olist Envios (o app de entregas instalado na loja da Shopify) — regras puras, sem
 * rede: peso da caixa, endereço no formato da Shopify e escolha da opção mais barata.
 * Quem fala com a Shopify é ./api; quem grava no pedido é ./frete.
 */

/** Regra do dono da loja (2026-11-25): cada lata ou garrafa conta 500 g, arredondado. */
export const PESO_POR_CERVEJA_KG = 0.5

/**
 * Só as opções deste app entram na conta. A loja tem outro app de frete (ShipZip, a "Entrega VIP
 * no mesmo dia"), que fica de fora: o frete fixo é decidido pela lista de CEPs VIP do CRM.
 */
export const TRANSPORTE = 'Olist Envios'

/** Valor declarado por cerveja quando não há pedido (teste da tela de Configurações). */
export const VALOR_PADRAO_POR_CERVEJA = 25

export type EnderecoParaCotar = {
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
}

export type PedidoParaCotar = {
  /** Cervejas na caixa (o kit já vem contado por cerveja). */
  unidades: number
  cep: string
  endereco: EnderecoParaCotar
  /** Valor das cervejas (valor declarado do envio). */
  valor: number
}

export type OpcaoDeFrete = { servico: string; valor: number }

export type MotivoDaFalha =
  | 'sem_conexao'
  | 'endereco_incompleto'
  | 'sem_opcoes'
  | 'sem_permissao'
  | 'credenciais_recusadas'
  | 'shopify_recusou'
  | 'shopify_fora_do_ar'

export type ResultadoDaCotacao =
  | { ok: true; valor: number; servico: string; pesoKg: number; opcoes: OpcaoDeFrete[] }
  | { ok: false; motivo: MotivoDaFalha; detalhe: string }

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))

const SUBDOMINIO = /^[a-z0-9][a-z0-9-]{0,60}$/

/**
 * "minhaloja", "minhaloja.myshopify.com", "https://minhaloja.myshopify.com/admin" ou
 * "admin.shopify.com/store/minhaloja" → "minhaloja". Domínio próprio (www.loja.com.br) não serve:
 * a API só atende no endereço .myshopify.com.
 */
export function normalizarLoja(valor: string): string | null {
  const texto = valor.trim().toLowerCase().replace(/^https?:\/\//, '')
  const admin = texto.match(/^admin\.shopify\.com\/store\/([^/?#]+)/)
  const candidato = admin ? admin[1] : texto.split(/[/?#]/)[0].replace(/\.myshopify\.com$/, '')
  return SUBDOMINIO.test(candidato) ? candidato : null
}

export function pesoDaCaixaKg(unidades: number): number {
  return Math.round(Math.max(0, Math.floor(unidades)) * PESO_POR_CERVEJA_KG * 1000) / 1000
}

const limpo = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ')

/**
 * Entrada do draftOrderCalculate: N cervejas de 500 g para o endereço da caixa — a mesma conta que
 * o checkout da loja faria para N latas (o Olist Envios calcula o volume por unidade). Devolve
 * null quando falta o mínimo para a Shopify achar a região de entrega (CEP, cidade e UF).
 */
export function entradaDaCotacao(pedido: PedidoParaCotar) {
  const unidades = Math.floor(pedido.unidades)
  const cep = pedido.cep.replace(/\D/g, '')
  const cidade = limpo(pedido.endereco.cidade)
  const uf = limpo(pedido.endereco.uf).toUpperCase()
  if (unidades < 1 || cep.length !== 8 || !cidade || !UFS.has(uf)) return null

  const rua = [limpo(pedido.endereco.logradouro), limpo(pedido.endereco.numero)].filter(Boolean).join(', ')
  const complemento = [limpo(pedido.endereco.complemento), limpo(pedido.endereco.bairro)].filter(Boolean).join(' · ')
  const valorUnitario = Math.max(Math.round((Math.max(pedido.valor, 0) / unidades) * 100) / 100, 0.01)

  return {
    lineItems: [
      {
        title: 'Caixa VIP (cerveja)',
        quantity: unidades,
        originalUnitPriceWithCurrency: { amount: valorUnitario.toFixed(2), currencyCode: 'BRL' },
        requiresShipping: true,
        taxable: false,
        weight: { value: PESO_POR_CERVEJA_KG, unit: 'KILOGRAMS' },
      },
    ],
    shippingAddress: {
      address1: (rua || 'Endereço da entrega').slice(0, 120),
      ...(complemento ? { address2: complemento.slice(0, 120) } : {}),
      city: cidade.slice(0, 80),
      provinceCode: uf,
      countryCode: 'BR',
      zip: `${cep.slice(0, 5)}-${cep.slice(5)}`,
    },
  }
}

export type TaxaDaShopify = { handle?: string | null; title?: string | null; price?: { amount?: string | number | null; currencyCode?: string | null } | null }

/** O `handle` da taxa é um JWT cujo conteúdo diz qual app calculou (`source`). Sem isso, vale o título. */
function origemDaTaxa(taxa: TaxaDaShopify): string {
  try {
    const conteudo = taxa.handle?.split('.')[1]
    if (conteudo) {
      const bytes = Uint8Array.from(atob(conteudo.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
      const dados = JSON.parse(new TextDecoder().decode(bytes)) as { source?: unknown }
      if (typeof dados.source === 'string' && dados.source.trim()) return dados.source
    }
  } catch {
    // handle em outro formato: decide pelo título
  }
  return taxa.title ?? ''
}

/** Opções do Olist Envios em reais, da mais barata para a mais cara (sem repetir serviço). */
export function opcoesDoOlistEnvios(taxas: TaxaDaShopify[]): OpcaoDeFrete[] {
  const porServico = new Map<string, number>()
  for (const taxa of taxas) {
    const servico = limpo(taxa.title)
    const valor = Number(taxa.price?.amount)
    const moeda = taxa.price?.currencyCode
    if (!servico || !Number.isFinite(valor) || valor < 0 || (moeda && moeda !== 'BRL')) continue
    if (!limpo(origemDaTaxa(taxa)).toLowerCase().startsWith(TRANSPORTE.toLowerCase())) continue
    const centavos = Math.round(valor * 100) / 100
    porServico.set(servico, Math.min(porServico.get(servico) ?? Infinity, centavos))
  }
  return [...porServico].map(([servico, valor]) => ({ servico, valor })).sort((a, b) => a.valor - b.valor || a.servico.localeCompare(b.servico, 'pt-BR'))
}

/** O que o cliente paga: sempre a opção mais barata (decisão do dono da loja). */
export function escolherFrete(taxas: TaxaDaShopify[], unidades: number): ResultadoDaCotacao {
  const opcoes = opcoesDoOlistEnvios(taxas)
  if (opcoes.length === 0) {
    return { ok: false, motivo: 'sem_opcoes', detalhe: `o ${TRANSPORTE} não devolveu opção de entrega para este CEP e este peso` }
  }
  return { ok: true, valor: opcoes[0].valor, servico: opcoes[0].servico, pesoKg: pesoDaCaixaKg(unidades), opcoes: opcoes.slice(0, 8) }
}

/** Motivo de uma falha em uma frase para a equipe (com maiúscula e ponto final). */
export function fraseDaFalha(detalhe: string | null | undefined): string {
  const texto = limpo(detalhe).replace(/[.!\s]+$/, '')
  if (!texto) return 'Não foi possível calcular o frete.'
  return `${texto[0].toLocaleUpperCase('pt-BR')}${texto.slice(1)}.`
}

/** "Olist Envios Correios SEDEX" → "Correios SEDEX" (a transportadora, sem o nome do app). */
export function nomeDaTransportadora(servico: string): string {
  return servico.replace(new RegExp(`^${TRANSPORTE}\\s*`, 'i'), '').trim() || servico
}

// -----------------------------------------------------------------------------
// O que fica guardado no pedido (pedidos.frete_cotacao)
// -----------------------------------------------------------------------------

export type CotacaoDoPedido =
  | { situacao: 'ok' | 'desatualizada'; servico: string; valor: number; unidades: number; pesoKg: number | null; cep: string; quando: string | null; opcoes: OpcaoDeFrete[] }
  | { situacao: 'falhou'; motivo: string; detalhe: string; unidades: number; cep: string; quando: string | null }

const numero = (v: unknown) => (typeof v === 'number' ? v : Number(v))
const texto = (v: unknown) => (typeof v === 'string' ? v : '')

/** JSON de pedidos.frete_cotacao → dados seguros para a tela (null = frete fixo ou cotado à mão). */
export function lerCotacaoDoPedido(json: unknown): CotacaoDoPedido | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const c = json as Record<string, unknown>
  if (c.origem !== 'shopify') return null
  const base = { unidades: numero(c.unidades) || 0, cep: texto(c.cep) }

  if (c.situacao === 'falhou') {
    return { situacao: 'falhou', motivo: texto(c.motivo), detalhe: texto(c.detalhe), quando: texto(c.tentado_em) || null, ...base }
  }
  if (c.situacao !== 'ok' && c.situacao !== 'desatualizada') return null
  const valor = numero(c.valor)
  if (!Number.isFinite(valor)) return null
  const peso = numero(c.peso_kg)
  return {
    situacao: c.situacao,
    servico: texto(c.servico) || TRANSPORTE,
    valor,
    pesoKg: Number.isFinite(peso) && peso > 0 ? peso : null,
    quando: texto(c.cotado_em) || null,
    opcoes: (Array.isArray(c.opcoes) ? c.opcoes : []).flatMap((o) => {
      const opcao = o as { servico?: unknown; valor?: unknown } | null
      const v = numero(opcao?.valor)
      return opcao && typeof opcao.servico === 'string' && Number.isFinite(v) ? [{ servico: opcao.servico, valor: v }] : []
    }),
    ...base,
  }
}
