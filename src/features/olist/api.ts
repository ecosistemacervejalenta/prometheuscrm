import 'server-only'

import { lerDinheiro } from '@/lib/format'

/**
 * Cliente da API v3 do Olist ERP — só o que o CRM usa: pedidos de venda (painel de vendas),
 * produtos e estoque (pré-vendas).
 * Doc: https://api-docs.erp.olist.com/api-reference
 */

const API = 'https://api.tiny.com.br/public-api/v3'
const POR_PAGINA = 100
const MAX_TENTATIVAS = 4

export type PedidoOlist = {
  id: number
  numeroPedido?: number | null
  situacao?: number | null
  dataCriacao?: string | null
  valor?: string | number | null
  ecommerce?: { id?: number | null; nome?: string | null; canalVenda?: string | null } | null
}

export type CanalErp = 'mercado_livre' | 'shopee' | 'shopify' | 'outro' | 'sem_ecommerce'

/** Canal do painel a partir do e-commerce do pedido no Olist ("API Tiny" e demais = outro). */
export function canalDoEcommerce(ecommerce: PedidoOlist['ecommerce']): CanalErp {
  const texto = [ecommerce?.nome, ecommerce?.canalVenda].filter(Boolean).join(' ')
  if (!texto.trim()) return 'sem_ecommerce'
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (t.includes('mercado livre') || t.includes('mercadolivre') || t.includes('mercado_livre')) return 'mercado_livre'
  if (t.includes('shopee')) return 'shopee'
  if (t.includes('shopify')) return 'shopify'
  return 'outro'
}

/** "2026-10-05", "2026-10-05 14:30:00" ou "05/10/2026" → "2026-10-05" (null se inválida). */
export function dataDoPedido(valor: string | null | undefined): string | null {
  if (!valor) return null
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

export function valorDoPedido(valor: PedidoOlist['valor']): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  if (!valor) return 0
  const n = /,/.test(valor) ? lerDinheiro(valor) : Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** Linha da tabela pedidos_erp (null se o pedido vier sem data). */
export function paraPedidoErp(p: PedidoOlist, sincronizadoEm: string) {
  const data = dataDoPedido(p.dataCriacao)
  if (!data || typeof p.id !== 'number') return null
  return {
    id: p.id,
    numero: p.numeroPedido ?? null,
    canal: canalDoEcommerce(p.ecommerce),
    ecommerce: p.ecommerce?.nome?.trim() || null,
    situacao: p.situacao ?? 0,
    data_pedido: data,
    valor: valorDoPedido(p.valor),
    sincronizado_em: sincronizadoEm,
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Resposta de erro da Olist (status HTTP guardado para a fila decidir se tenta de novo). */
export class ErroApiOlist extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    /** Segundos até a Olist liberar novas chamadas (limite por minuto). */
    readonly liberaEm: number | null = null,
  ) {
    super(mensagem)
  }
}

type OpcoesRequisicao = {
  metodo?: 'GET' | 'POST'
  corpo?: unknown
  /** false: no limite de chamadas, devolve o erro na hora em vez de esperar a liberação. */
  esperarLimite?: boolean
}

async function requisicao(caminho: string, accessToken: string, opcoes: OpcoesRequisicao = {}): Promise<unknown> {
  const { metodo = 'GET', corpo, esperarLimite = true } = opcoes
  // Escrita não é repetida às cegas: um lançamento de estoque em dobro é pior que um atraso.
  const podeRepetir = metodo === 'GET'
  for (let tentativa = 1; ; tentativa++) {
    const resposta = await fetch(`${API}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (resposta.ok) return resposta.status === 204 ? null : resposta.json().catch(() => null)

    // Limite de requisições (por conta): espera o reset informado pela API e tenta de novo.
    if (resposta.status === 429) {
      const reset = Number(resposta.headers.get('X-RateLimit-Reset'))
      const segundos = Math.min(Number.isFinite(reset) && reset > 0 ? reset : 5, 60)
      if (esperarLimite && tentativa < MAX_TENTATIVAS) {
        await esperar(segundos * 1000)
        continue
      }
      throw new ErroApiOlist('A Olist pediu para esperar (limite de chamadas por minuto).', 429, segundos)
    }
    if (resposta.status >= 500 && podeRepetir && tentativa < MAX_TENTATIVAS) {
      await esperar(1000 * tentativa)
      continue
    }
    const detalhe = await resposta.text().catch(() => '')
    if (resposta.status === 401) throw new ErroApiOlist('Olist recusou o token de acesso (401).', 401)
    if (resposta.status === 403) {
      throw new ErroApiOlist(
        'A Olist negou o acesso (403): libere Produtos e Estoque no aplicativo do CRM na Olist e reconecte em Configurações › Olist ERP.',
        403,
      )
    }
    throw new ErroApiOlist(`Olist respondeu ${resposta.status} em ${caminho.split('?')[0]}: ${resumirErro(detalhe)}`, resposta.status)
  }
}

/** Mensagem legível do corpo de erro da Olist (JSON com "mensagem"/"detalhes" ou texto). */
function resumirErro(corpo: string): string {
  try {
    const json = JSON.parse(corpo) as { mensagem?: unknown; message?: unknown; detalhes?: unknown }
    const partes = [json.mensagem ?? json.message, json.detalhes ? JSON.stringify(json.detalhes) : null].filter(Boolean)
    if (partes.length) return partes.join(' · ').slice(0, 300)
  } catch {
    /* corpo não é JSON */
  }
  return corpo.slice(0, 300)
}

const get = (caminho: string, accessToken: string) => requisicao(caminho, accessToken)

/**
 * Todos os pedidos de venda que atendem ao filtro (paginado de 100 em 100).
 * Datas: "AAAA-MM-DD"; dataAtualizacao aceita "AAAA-MM-DD HH:mm:ss" (horário de Brasília).
 */
export async function listarPedidos(
  accessToken: string,
  filtro: { dataInicial?: string; dataFinal?: string; dataAtualizacao?: string },
): Promise<PedidoOlist[]> {
  const pedidos: PedidoOlist[] = []
  for (let offset = 0; ; offset += POR_PAGINA) {
    const params = new URLSearchParams({ limit: String(POR_PAGINA), offset: String(offset), orderBy: 'asc' })
    for (const [chave, valor] of Object.entries(filtro)) if (valor) params.set(chave, valor)
    const pagina = (await get(`/pedidos?${params}`, accessToken)) as {
      itens?: PedidoOlist[]
      paginacao?: { total?: number }
    }
    const itens = pagina.itens ?? []
    pedidos.push(...itens)
    const total = pagina.paginacao?.total ?? 0
    if (itens.length < POR_PAGINA || offset + POR_PAGINA >= total) return pedidos
  }
}

// -----------------------------------------------------------------------------
// Produtos e estoque (pré-vendas)
// -----------------------------------------------------------------------------

type ProdutoListadoOlist = {
  id: number
  sku?: string | null
  descricao?: string | null
  tipo?: string | null
  situacao?: string | null
  tipoVariacao?: string | null
  precos?: { preco?: number | null; precoPromocional?: number | null } | null
}

type ProdutoDetalheOlist = ProdutoListadoOlist & {
  anexos?: Array<{ url?: string | null; externo?: boolean | null }> | null
  kit?: Array<{ produto?: { id?: number | null; sku?: string | null; descricao?: string | null } | null; quantidade?: number | null }> | null
  variacoes?: unknown[] | null
  estoque?: { controlar?: boolean | null } | null
}

type EstoqueRespostaOlist = {
  id?: number
  nome?: string | null
  codigo?: string | null
  saldo?: number | null
  reservado?: number | null
  disponivel?: number | null
}

/** Produto encontrado na busca da pré-venda. */
export type ResultadoBuscaOlist = {
  id: number
  sku: string | null
  nome: string
  kit: boolean
  preco: number | null
}

/** Produto pronto para virar cerveja no CRM. */
export type ProdutoOlist = {
  id: number
  sku: string | null
  nome: string
  preco: number | null
  /** URL da foto principal (1º anexo de imagem), se houver. */
  foto: string | null
  /** Kit: as cervejas que o compõem (a baixa vai para cada uma). */
  kit: Array<{ id: number; sku: string | null; nome: string; quantidade: number }>
  controlaEstoque: boolean
}

export type EstoqueOlist = { id: number; sku: string | null; nome: string; saldo: number; reservado: number; disponivel: number }

const numeroOuZero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const ehImagem = (url: string) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url) || /image|imagem|foto/i.test(url)

/**
 * Busca produtos ativos pelo nome (ou SKU, se nada vier pelo nome). Variações "pai" ficam de
 * fora: o estoque é de cada variação.
 */
export async function buscarProdutosOlist(accessToken: string, termo: string): Promise<ResultadoBuscaOlist[]> {
  const buscar = async (campo: 'nome' | 'codigo') => {
    const params = new URLSearchParams({ [campo]: termo, situacao: 'A', limit: '30', offset: '0' })
    const pagina = (await requisicao(`/produtos?${params}`, accessToken, { esperarLimite: false })) as { itens?: ProdutoListadoOlist[] } | null
    return pagina?.itens ?? []
  }
  let itens = await buscar('nome')
  if (itens.length === 0 && !/\s/.test(termo)) itens = await buscar('codigo')
  return itens
    .filter((p) => typeof p.id === 'number' && p.tipoVariacao !== 'P')
    .map((p) => ({
      id: p.id,
      sku: p.sku?.trim() || null,
      nome: p.descricao?.trim() || `Produto ${p.id}`,
      kit: p.tipo === 'K',
      preco: p.precos?.preco ?? null,
    }))
}

export async function obterProdutoOlist(accessToken: string, id: number): Promise<ProdutoOlist> {
  const p = (await requisicao(`/produtos/${id}`, accessToken, { esperarLimite: false })) as ProdutoDetalheOlist
  if (Array.isArray(p.variacoes) && p.variacoes.length > 0 && p.tipoVariacao === 'P') {
    throw new ErroApiOlist('Este produto tem variações na Olist: busque e escolha a variação (o estoque é de cada uma).', 400)
  }
  const anexos = (p.anexos ?? []).map((a) => a.url?.trim()).filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
  const kit =
    p.tipo === 'K'
      ? (p.kit ?? []).flatMap((k) =>
          typeof k.produto?.id === 'number'
            ? [{ id: k.produto.id, sku: k.produto.sku?.trim() || null, nome: k.produto.descricao?.trim() || `Produto ${k.produto.id}`, quantidade: Math.max(1, Math.ceil(numeroOuZero(k.quantidade) || 1)) }]
            : [],
        )
      : []
  if (p.tipo === 'K' && kit.length === 0) throw new ErroApiOlist('A Olist não informou as cervejas deste kit.', 400)
  return {
    id: p.id ?? id,
    sku: p.sku?.trim() || null,
    nome: p.descricao?.trim() || `Produto ${id}`,
    preco: p.precos?.preco ?? null,
    foto: anexos.find(ehImagem) ?? anexos[0] ?? null,
    kit,
    controlaEstoque: p.estoque?.controlar !== false,
  }
}

export async function obterEstoqueOlist(accessToken: string, id: number, opcoes: { esperarLimite?: boolean } = {}): Promise<EstoqueOlist> {
  const e = (await requisicao(`/estoque/${id}`, accessToken, opcoes)) as EstoqueRespostaOlist
  const saldo = numeroOuZero(e.saldo)
  const reservado = numeroOuZero(e.reservado)
  return {
    id,
    sku: e.codigo?.trim() || null,
    nome: e.nome?.trim() || '',
    saldo,
    reservado,
    disponivel: e.disponivel === null || e.disponivel === undefined ? saldo - reservado : numeroOuZero(e.disponivel),
  }
}

/** Lançamento avulso de estoque (S = saída, E = entrada) no depósito padrão. Devolve o id do lançamento. */
export async function lancarEstoqueOlist(
  accessToken: string,
  id: number,
  lancamento: { tipo: 'S' | 'E'; quantidade: number; observacoes: string },
): Promise<number | null> {
  const r = (await requisicao(`/estoque/${id}`, accessToken, {
    metodo: 'POST',
    esperarLimite: false,
    corpo: { tipo: lancamento.tipo, quantidade: lancamento.quantidade, observacoes: lancamento.observacoes.slice(0, 250) },
  })) as { idLancamento?: number } | null
  return typeof r?.idLancamento === 'number' ? r.idLancamento : null
}
