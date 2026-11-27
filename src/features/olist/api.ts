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

/**
 * TRAVA DE ESCRITA — a Olist é o ERP da empresa. O CRM só LÊ a Olist, com UMA exceção: lançar
 * entrada/saída de estoque (POST /estoque/{id}, o mesmo que "Lançar estoque" na tela da Olist).
 * Nada de cadastro de produto (descrição, peso, EAN, preços, custo...), pedidos ou notas.
 * Qualquer outra escrita é barrada aqui, antes de sair do servidor. Não afrouxe esta trava.
 */
const ESCRITA_PERMITIDA = /^\/estoque\/\d+$/
const CAMPOS_DO_LANCAMENTO = new Set(['tipo', 'quantidade', 'precoUnitario', 'observacoes'])

export class EscritaBloqueadaOlist extends Error {}

function conferirEscritaOlist(metodo: string, caminho: string, corpo: unknown) {
  if (metodo === 'GET') {
    if (corpo !== undefined) throw new EscritaBloqueadaOlist('Bloqueado: leitura na Olist não leva corpo.')
    return
  }
  const bloquear = (motivo: string) => {
    throw new EscritaBloqueadaOlist(`Bloqueado pela trava de escrita da Olist (${metodo} ${caminho.split('?')[0]}): ${motivo}`)
  }
  if (metodo !== 'POST' || !ESCRITA_PERMITIDA.test(caminho)) bloquear('o CRM só pode lançar estoque.')
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) bloquear('lançamento sem dados.')
  const dados = corpo as Record<string, unknown>
  const extras = Object.keys(dados).filter((campo) => !CAMPOS_DO_LANCAMENTO.has(campo))
  if (extras.length) bloquear(`campo não permitido: ${extras.join(', ')}.`)
  // "B" (balanço) troca o saldo inteiro por um número: proibido. Só entrada ou saída.
  if (dados.tipo !== 'S' && dados.tipo !== 'E') bloquear('tipo precisa ser S (saída) ou E (entrada).')
  const { quantidade, precoUnitario } = dados
  if (typeof quantidade !== 'number' || !Number.isInteger(quantidade) || quantidade <= 0 || quantidade > 1000) bloquear('quantidade inválida.')
  if (typeof precoUnitario !== 'number' || !Number.isFinite(precoUnitario) || precoUnitario < 0) bloquear('preço unitário inválido.')
}

async function requisicao(caminho: string, accessToken: string, opcoes: OpcoesRequisicao = {}): Promise<unknown> {
  const { metodo = 'GET', corpo, esperarLimite = true } = opcoes
  conferirEscritaOlist(metodo, caminho, corpo)
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

    // Limite de requisições (por conta): ~3 por segundo e 60 por minuto. O de segundo
    // (reset de 1–3 s) sempre espera e tenta de novo — inclusive POST, que a Olist recusou
    // sem lançar. O de minuto só espera quando esperarLimite.
    if (resposta.status === 429) {
      const reset = Number(resposta.headers.get('X-RateLimit-Reset'))
      const segundos = Math.min(Number.isFinite(reset) && reset > 0 ? reset : 5, 60)
      if ((esperarLimite || segundos <= 3) && tentativa < MAX_TENTATIVAS + 2) {
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
  /** Código de barras (EAN/GTIN) do cadastro. */
  gtin?: string | null
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

/** Resultados por busca (cada um custa 1 chamada a mais para foto e estoque; a Olist permite 60/min). */
export const LIMITE_BUSCA = 20

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
export type PaginaBuscaOlist = {
  produtos: ResultadoBuscaOlist[]
  /** Quantos produtos a Olist achou no total (para o "Ver mais"). */
  total: number
  /** Offset da próxima página, ou null se acabou. */
  proximo: number | null
}

export async function buscarProdutosOlist(accessToken: string, termo: string, offset = 0): Promise<PaginaBuscaOlist> {
  const buscar = async (campo: 'nome' | 'codigo') => {
    // O filtro "nome" da Olist é "começa com" ("Paulaner" não acha "Cerveja Paulaner..."); com %
    // vira "contém", e cada palavra pode estar em qualquer parte do nome, nessa ordem.
    const valor = campo === 'nome' ? `%${termo.trim().split(/\s+/).join('%')}%` : termo.trim()
    const params = new URLSearchParams({ [campo]: valor, situacao: 'A', limit: String(LIMITE_BUSCA), offset: String(offset) })
    const pagina = (await requisicao(`/produtos?${params}`, accessToken, { esperarLimite: false })) as {
      itens?: ProdutoListadoOlist[]
      paginacao?: { total?: number }
    } | null
    return { itens: pagina?.itens ?? [], total: pagina?.paginacao?.total ?? 0 }
  }
  let pagina = await buscar('nome')
  if (offset === 0 && pagina.itens.length === 0 && !/\s/.test(termo)) pagina = await buscar('codigo')
  const fim = offset + pagina.itens.length
  return {
    total: Math.max(pagina.total, fim),
    proximo: pagina.itens.length === LIMITE_BUSCA && fim < pagina.total ? fim : null,
    produtos: pagina.itens
      .filter((p) => typeof p.id === 'number' && p.tipoVariacao !== 'P')
      .map((p) => ({
        id: p.id,
        sku: p.sku?.trim() || null,
        nome: p.descricao?.trim() || `Produto ${p.id}`,
        kit: p.tipo === 'K',
        preco: p.precos?.preco ?? null,
      })),
  }
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

/**
 * Foto principal e estoque de um produto numa chamada só (para a lista da busca).
 * O estoque aqui é o saldo; o disponível exato é lido ao adicionar à pré-venda.
 */
export async function obterResumoProdutoOlist(accessToken: string, id: number): Promise<{ foto: string | null; estoque: number | null }> {
  const p = (await requisicao(`/produtos/${id}`, accessToken, { esperarLimite: false })) as ProdutoDetalheOlist & {
    estoque?: { quantidade?: number | null } | null
  }
  const anexos = (p.anexos ?? []).map((a) => a.url?.trim()).filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
  const quantidade = p.estoque?.quantidade
  return {
    foto: anexos.find(ehImagem) ?? anexos[0] ?? null,
    estoque: typeof quantidade === 'number' && Number.isFinite(quantidade) ? quantidade : null,
  }
}

/** Produto consultado para o módulo Lotes e validades (só leitura). */
export type ProdutoLoteOlist = {
  id: number
  sku: string | null
  nome: string
  /** URL da foto principal (1º anexo de imagem), se houver. */
  foto: string | null
  /** Unidades em estoque (saldo); null se a Olist não informar. */
  estoque: number | null
}

/** Nome, SKU, foto principal e unidades em estoque de um produto (só consulta). */
export async function obterProdutoLoteOlist(accessToken: string, id: number): Promise<ProdutoLoteOlist> {
  const p = (await requisicao(`/produtos/${id}`, accessToken, { esperarLimite: false })) as ProdutoDetalheOlist & {
    estoque?: { quantidade?: number | null } | null
  }
  const anexos = (p.anexos ?? []).map((a) => a.url?.trim()).filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
  const quantidade = p.estoque?.quantidade
  let estoque = typeof quantidade === 'number' && Number.isFinite(quantidade) ? quantidade : null
  // O cadastro do produto veio sem a quantidade: lê o saldo no estoque.
  if (estoque === null) {
    estoque = await obterEstoqueOlist(accessToken, id, { esperarLimite: false })
      .then((e) => e.saldo)
      .catch(() => null)
  }
  return {
    id: p.id ?? id,
    sku: p.sku?.trim() || null,
    nome: p.descricao?.trim() || `Produto ${id}`,
    foto: anexos.find(ehImagem) ?? anexos[0] ?? null,
    estoque,
  }
}

/** Produto da Olist achado pela busca (só o que a listagem traz; o detalhe é outra chamada). */
export type ProdutoAchadoOlist = { id: number; sku: string | null; nome: string; ativo: boolean }

const paraAchado = (p: ProdutoListadoOlist): ProdutoAchadoOlist => ({
  id: p.id,
  sku: p.sku?.trim() || null,
  nome: p.descricao?.trim() || `Produto ${p.id}`,
  ativo: p.situacao === 'A',
})

/**
 * Acha o produto pelo SKU exato (sem diferenciar maiúsculas). Procura nos ativos e, se não
 * achar, nos demais (um produto inativo ainda pode ter lote na prateleira). Devolve null se
 * nenhum produto da Olist tiver esse SKU.
 */
export async function acharProdutoPorSkuOlist(accessToken: string, sku: string): Promise<ProdutoAchadoOlist | null> {
  const alvo = sku.trim().toLowerCase()
  const listar = async (situacao?: 'A') => {
    const params = new URLSearchParams({ codigo: sku.trim(), limit: String(POR_PAGINA) })
    if (situacao) params.set('situacao', situacao)
    const pagina = (await requisicao(`/produtos?${params}`, accessToken, { esperarLimite: false })) as { itens?: ProdutoListadoOlist[] } | null
    return (pagina?.itens ?? []).filter((p) => typeof p.id === 'number' && p.sku?.trim().toLowerCase() === alvo && p.situacao !== 'E')
  }
  let iguais = await listar('A')
  if (iguais.length === 0) iguais = await listar()
  // Produto "pai" de variações não tem estoque próprio: prefere o item vendável.
  const achado = iguais.find((p) => p.tipoVariacao !== 'P') ?? iguais[0]
  return achado ? paraAchado(achado) : null
}

/** Só os dígitos, sem zeros à esquerda: "0012345678905" e "12345678905" são o mesmo código. */
const normalizarGtin = (codigo: string) => codigo.replace(/\D/g, '').replace(/^0+/, '')

/**
 * Produtos com este código de barras (EAN/GTIN) no cadastro da Olist, ativos primeiro. O filtro
 * "gtin" da Olist é exato e ignora zeros à esquerda (o leitor pode mandar o UPC-A com um 0 na
 * frente); a conferência aqui repete essa regra. Excluídos ficam de fora; produto "pai" de
 * variações só entra se não houver o item vendável. Uma chamada só.
 */
export async function buscarProdutosPorGtinOlist(accessToken: string, gtin: string): Promise<ProdutoAchadoOlist[]> {
  const alvo = normalizarGtin(gtin)
  if (!alvo) return []
  const params = new URLSearchParams({ gtin: gtin.replace(/\D/g, ''), limit: String(POR_PAGINA) })
  const pagina = (await requisicao(`/produtos?${params}`, accessToken, { esperarLimite: false })) as { itens?: ProdutoListadoOlist[] } | null
  const iguais = (pagina?.itens ?? []).filter((p) => typeof p.id === 'number' && p.situacao !== 'E' && normalizarGtin(p.gtin ?? '') === alvo)
  const vendaveis = iguais.filter((p) => p.tipoVariacao !== 'P')
  return (vendaveis.length ? vendaveis : iguais).map(paraAchado).sort((a, b) => Number(b.ativo) - Number(a.ativo))
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

/**
 * Custo unitário que acompanha o lançamento de estoque: SEMPRE o custo médio atual do produto
 * na Olist, exato — inclusive 0. Lançar pelo mesmo valor da média não muda a média (nem na
 * saída da venda, nem na entrada da devolução). Nunca usar o preço de custo nem o de venda aqui:
 * com média 0, uma entrada pelo preço de custo puxaria a média para cima.
 */
async function custoUnitarioOlist(accessToken: string, id: number): Promise<number> {
  const p = (await requisicao(`/produtos/${id}`, accessToken, { esperarLimite: false })) as {
    precos?: { precoCustoMedio?: number | null } | null
  } | null
  const medio = p?.precos?.precoCustoMedio
  return typeof medio === 'number' && Number.isFinite(medio) && medio >= 0 ? medio : 0
}

/**
 * Lançamento avulso de estoque (S = saída, E = entrada) no depósito padrão. Devolve o id do lançamento.
 * A Olist exige `precoUnitario` (sem ele responde 400 "Este valor não deve ser vazio").
 */
export async function lancarEstoqueOlist(
  accessToken: string,
  id: number,
  lancamento: { tipo: 'S' | 'E'; quantidade: number; observacoes: string },
): Promise<number | null> {
  const precoUnitario = await custoUnitarioOlist(accessToken, id)
  const r = (await requisicao(`/estoque/${id}`, accessToken, {
    metodo: 'POST',
    esperarLimite: false,
    corpo: {
      tipo: lancamento.tipo,
      quantidade: lancamento.quantidade,
      precoUnitario,
      observacoes: lancamento.observacoes.slice(0, 250),
    },
  })) as { idLancamento?: number } | null
  return typeof r?.idLancamento === 'number' ? r.idLancamento : null
}
