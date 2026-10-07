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
  return { wamid, waId: r.contacts?.[0]?.wa_id ?? null }
}
