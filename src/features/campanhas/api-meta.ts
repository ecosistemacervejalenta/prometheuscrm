import 'server-only'

/**
 * Cliente da API Cloud do WhatsApp (Graph API da Meta) — só o que as Campanhas usam.
 * Ref.: developers.facebook.com/documentation/business-messaging/whatsapp
 */

export const VERSAO_GRAPH = 'v26.0'
const GRAPH = `https://graph.facebook.com/${VERSAO_GRAPH}`
const TEMPO_LIMITE_MS = 20_000

export type CredenciaisMeta = {
  appId: string
  phoneNumberId: string
  wabaId: string
  token: string
}

export class ErroMeta extends Error {
  constructor(
    mensagem: string,
    readonly codigo: number | null,
    readonly subcodigo: number | null = null,
    /** Sem resposta (rede ou tempo esgotado): o pedido pode ter chegado à Meta. */
    readonly semResposta = false,
  ) {
    super(mensagem)
    this.name = 'ErroMeta'
  }
}

type RespostaErro = { error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } } }

async function chamar<T>(token: string, caminho: string, opcoes: { metodo?: 'GET' | 'POST'; corpo?: unknown } = {}): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`${GRAPH}${caminho}`, {
      method: opcoes.metodo ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(opcoes.corpo !== undefined && { 'Content-Type': 'application/json' }) },
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
  } catch {
    throw new ErroMeta('Sem resposta da Meta.', null, null, true)
  }
  const dados = (await resposta.json().catch(() => ({}))) as T & RespostaErro
  if (!resposta.ok || dados.error) {
    const e = dados.error
    const detalhe = e?.error_data?.details
    throw new ErroMeta(
      [e?.message, detalhe].filter(Boolean).join(' — ') || `HTTP ${resposta.status}`,
      e?.code ?? (resposta.status >= 500 ? null : resposta.status),
      e?.error_subcode ?? null,
    )
  }
  return dados
}

// Número ------------------------------------------------------------------------------

export type NumeroMeta = {
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  name_status?: string
  status?: string
  platform_type?: string
  whatsapp_business_manager_messaging_limit?: string
}

export function lerNumero(c: CredenciaisMeta) {
  const campos = 'display_phone_number,verified_name,quality_rating,name_status,status,platform_type,whatsapp_business_manager_messaging_limit'
  return chamar<NumeroMeta>(c.token, `/${c.phoneNumberId}?fields=${campos}`)
}

/** Registra o número na API Cloud (obrigatório uma vez). O PIN é o da confirmação em duas etapas. */
export function registrarNumero(c: CredenciaisMeta, pin: string) {
  return chamar<{ success: boolean }>(c.token, `/${c.phoneNumberId}/register`, {
    metodo: 'POST',
    corpo: { messaging_product: 'whatsapp', pin },
  })
}

/** Liga o app à conta do WhatsApp para os avisos do webhook chegarem (pode repetir sem problema). */
export function inscreverApp(c: CredenciaisMeta) {
  return chamar<{ success: boolean }>(c.token, `/${c.wabaId}/subscribed_apps`, { metodo: 'POST' })
}

/** IDs dos apps já ligados à conta do WhatsApp. */
export async function appsInscritos(c: CredenciaisMeta): Promise<string[]> {
  const r = await chamar<{ data?: Array<{ whatsapp_business_api_data?: { id?: string } }> }>(c.token, `/${c.wabaId}/subscribed_apps`)
  return (r.data ?? []).map((a) => a.whatsapp_business_api_data?.id).filter((id): id is string => Boolean(id))
}

// Modelos (templates) -----------------------------------------------------------------

export type ModeloMeta = { id: string; status: string; category?: string; rejected_reason?: string }

export function criarModelo(c: CredenciaisMeta, corpo: unknown) {
  return chamar<ModeloMeta>(c.token, `/${c.wabaId}/message_templates`, { metodo: 'POST', corpo })
}

export function lerModelo(c: CredenciaisMeta, id: string) {
  return chamar<ModeloMeta>(c.token, `/${id}?fields=status,category,rejected_reason`)
}

/** Modelo pelo nome (quando a criação diz que ele já existe). */
export async function buscarModeloPorNome(c: CredenciaisMeta, nome: string): Promise<ModeloMeta | null> {
  const r = await chamar<{ data?: Array<ModeloMeta & { name: string }> }>(
    c.token,
    `/${c.wabaId}/message_templates?name=${encodeURIComponent(nome)}&fields=name,status,category,rejected_reason`,
  )
  return r.data?.find((m) => m.name === nome) ?? null
}

/**
 * Foto de exemplo do modelo (a Meta exige uma na análise): Resumable Upload API do app.
 * Devolve o "handle" usado em header_handle.
 */
export async function enviarExemploImagem(c: CredenciaisMeta, arquivo: Blob, nome: string): Promise<string> {
  const tipo = arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const sessao = await chamar<{ id: string }>(
    c.token,
    `/${c.appId}/uploads?file_name=${encodeURIComponent(nome)}&file_length=${arquivo.size}&file_type=${tipo}`,
    { metodo: 'POST' },
  )
  let resposta: Response
  try {
    // O id da sessão vai no caminho exatamente como veio ("upload:...?sig=...").
    resposta = await fetch(`${GRAPH}/${sessao.id}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${c.token}`, file_offset: '0' },
      body: arquivo,
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS * 3),
    })
  } catch {
    throw new ErroMeta('Sem resposta da Meta ao enviar a foto.', null, null, true)
  }
  const dados = (await resposta.json().catch(() => ({}))) as { h?: string } & RespostaErro
  if (!resposta.ok || !dados.h) {
    throw new ErroMeta(dados.error?.message ?? 'A Meta não aceitou a foto da campanha.', dados.error?.code ?? 131053)
  }
  return dados.h
}

// Custos -------------------------------------------------------------------------------

export type PontoCobranca = {
  start?: number
  end?: number
  country?: string
  pricing_category?: string
  pricing_type?: string
  volume?: number
  cost?: number
}

/** Cobranças da conta por dia, categoria e país (pricing_analytics), mais a moeda da conta. */
export async function lerCobrancas(c: CredenciaisMeta, inicio: number, fim: number) {
  const analise = `pricing_analytics.start(${inicio}).end(${fim}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE","COUNTRY"])`
  const r = await chamar<{ currency?: string; pricing_analytics?: { data?: Array<{ data_points?: PontoCobranca[] }> } }>(
    c.token,
    `/${c.wabaId}?fields=currency,${encodeURIComponent(analise)}`,
  )
  return { moeda: r.currency ?? null, pontos: (r.pricing_analytics?.data ?? []).flatMap((d) => d.data_points ?? []) }
}

type PontoModelo = { template_id?: string; cost?: Array<{ type?: string; value?: number }> }
type PaginaModelos = { data?: Array<{ data_points?: PontoModelo[] }>; paging?: { next?: string } }

/**
 * Quanto a Meta cobrou por modelo no período (template_analytics, métrica COST → amount_spent).
 * Até 10 modelos por chamada; dados diários, com algumas horas de atraso.
 */
export async function lerCustoDosModelos(c: CredenciaisMeta, ids: string[], inicio: number, fim: number): Promise<Map<string, number>> {
  const custo = new Map<string, number>()
  const parametros = new URLSearchParams({
    start: String(inicio),
    end: String(fim),
    granularity: 'DAILY',
    metric_types: JSON.stringify(['COST', 'DELIVERED']),
    template_ids: JSON.stringify(ids),
  })
  let caminho: string | null = `/${c.wabaId}/template_analytics?${parametros}`
  for (let pagina = 0; caminho && pagina < 10; pagina++) {
    const r: PaginaModelos = await chamar<PaginaModelos>(c.token, caminho)
    for (const p of (r.data ?? []).flatMap((d) => d.data_points ?? [])) {
      const gasto = p.cost?.find((m) => m.type === 'amount_spent')?.value
      if (p.template_id && typeof gasto === 'number') custo.set(p.template_id, (custo.get(p.template_id) ?? 0) + gasto)
    }
    // A próxima página vem como URL completa da Graph API: segue só o caminho.
    caminho = r.paging?.next ? r.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, '') : null
  }
  return custo
}

// Envio --------------------------------------------------------------------------------

export type ModeloParaEnvio = { name: string; language: { code: string }; components: unknown[] }

export async function enviarModelo(c: CredenciaisMeta, para: string, modelo: ModeloParaEnvio) {
  const r = await chamar<{ contacts?: Array<{ wa_id?: string }>; messages?: Array<{ id: string; message_status?: string }> }>(
    c.token,
    `/${c.phoneNumberId}/messages`,
    {
      metodo: 'POST',
      corpo: { messaging_product: 'whatsapp', recipient_type: 'individual', to: `+${para}`, type: 'template', template: modelo },
    },
  )
  const wamid = r.messages?.[0]?.id
  if (!wamid) throw new ErroMeta('A Meta não devolveu o id da mensagem.', null)
  // "held_for_quality_assessment": aceita, mas retida enquanto a Meta avalia a qualidade (pacing).
  return { wamid, waId: r.contacts?.[0]?.wa_id ?? null, retida: r.messages?.[0]?.message_status === 'held_for_quality_assessment' }
}
