import 'server-only'

import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'

import { envServidor } from '@/lib/env.server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarWhatsapp } from '@/lib/whatsapp'

import { conversaDoNumero, enviarTextoDeSistema, ErroUazapi, uazapiConfigurada } from '../../atendimento/uazapi'
import { DIAS_APARELHO_LEMBRADO, EMPRESA, MINUTOS_CODIGO } from '../../privacidade/empresa'

/**
 * Confirmação do WhatsApp no link da pré-venda (LGPD, 2026-11-25).
 * O link só mostra o cadastro e a Caixa VIP — e só aceita a compra — de quem provou que tem o
 * número: um código de 6 dígitos chega no WhatsApp digitado. Confirmado, o aparelho fica
 * lembrado por 90 dias num cookie httpOnly com um token aleatório (no banco, só o hash dele).
 */

const COOKIE = 'cl_whatsapp'

/** HMAC com a chave secreta do servidor: código e IP nunca ficam em texto no banco. */
function hmac(contexto: string, valor: string) {
  return createHmac('sha256', envServidor.supabaseSecretKey).update(`${contexto}:${valor}`).digest('hex')
}

const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex')
const hashDoCodigo = (whatsapp: string, codigo: string) => hmac('codigo-link', `${whatsapp}:${codigo}`)

async function hashDoIp() {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim()
  return ip ? hmac('ip-link', ip) : null
}

/** WhatsApp (normalizado) confirmado neste aparelho, ou null. */
export async function whatsappConfirmado(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token || token.length < 32) return null
  const { data, error } = await createAdminClient().rpc('whatsapp_da_sessao_link', { p_token_hash: hashDoToken(token) })
  if (error) console.error('[link] sessão do aparelho', error.message)
  return typeof data === 'string' && data ? data : null
}

/** O aparelho confirmou ESTE número? */
export async function aparelhoConfirmou(whatsapp: string) {
  const numero = normalizarWhatsapp(whatsapp)
  return Boolean(numero) && (await whatsappConfirmado()) === numero
}

/** "Não sou eu": o aparelho deixa de ser confirmado (no banco e no cookie). */
export async function esquecerAparelho() {
  const loja = await cookies()
  const token = loja.get(COOKIE)?.value
  if (token) {
    const { error } = await createAdminClient().rpc('encerrar_sessao_link', { p_token_hash: hashDoToken(token) })
    if (error) console.error('[link] encerrar sessão', error.message)
  }
  loja.delete(COOKIE)
}

export type ResultadoPedidoDeCodigo =
  /**
   * O cliente digita o código. `enviado` = saiu um código agora (senão vale o último que chegou);
   * `espera` = segundos até poder pedir outro.
   */
  | { ok: true; enviado: boolean; espera: number; aviso?: string }
  | { ok: false; mensagem: string }

type RespostaEmissao = { ok: boolean; id?: string; motivo?: 'aguarde' | 'limite'; segundos?: number }

const minutos = (segundos: number) => Math.max(1, Math.ceil(segundos / 60))

/** Gera o código, manda no WhatsApp do número e devolve quanto esperar para pedir outro. */
export async function enviarCodigo(whatsapp: string): Promise<ResultadoPedidoDeCodigo> {
  const numero = normalizarWhatsapp(whatsapp)
  if (!numero) return { ok: false, mensagem: 'Confira o número: DDD + celular.' }

  const producao = process.env.NODE_ENV === 'production'
  if (!uazapiConfigurada() && producao) {
    console.error('[link] uazapi sem configuração: não dá para mandar o código')
    return { ok: false, mensagem: 'Não conseguimos mandar o código agora. Tente de novo em alguns minutos ou fale com a loja.' }
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const db = createAdminClient()
  const { data, error } = await db.rpc('emitir_codigo_link', {
    p_whatsapp: numero,
    p_codigo_hash: hashDoCodigo(numero, codigo),
    p_ip_hash: (await hashDoIp()) ?? undefined,
  })
  if (error) {
    console.error('[link] emitir código', error.message)
    return { ok: false, mensagem: 'Não conseguimos gerar o código agora. Tente de novo em instantes.' }
  }

  const r = (data ?? {}) as RespostaEmissao
  if (!r.ok || !r.id) {
    const segundos = Math.max(Number(r.segundos) || 0, 0)
    // Já existe um código recente: o cliente usa o que chegou.
    if (r.motivo === 'aguarde') return { ok: true, enviado: false, espera: segundos }
    return {
      ok: true,
      enviado: false,
      espera: segundos,
      aviso: `Você já pediu vários códigos. Use o último que chegou no seu WhatsApp ou peça outro daqui a ${minutos(segundos)} min.`,
    }
  }

  const texto =
    `*${codigo}* é o seu código da ${EMPRESA.nomeFantasia}.\n\n` +
    `Digite no link da pré-venda para confirmar que este WhatsApp é seu. Vale por ${MINUTOS_CODIGO} minutos.\n\n` +
    'Não foi você? É só ignorar: sem este código ninguém vê os seus dados.'

  if (!uazapiConfigurada()) {
    // Desenvolvimento sem WhatsApp configurado: o código aparece no terminal.
    console.info(`[link] código para ${numero}: ${codigo}`)
    return { ok: true, enviado: true, espera: 45 }
  }

  try {
    const conversa = await conversaDoNumero(numero)
    if (!conversa) {
      await db.rpc('descartar_codigo_link', { p_id: r.id })
      return { ok: false, mensagem: 'Não encontramos WhatsApp nesse número. Confira o DDD e o número.' }
    }
    await enviarTextoDeSistema(conversa, texto, randomUUID())
    return { ok: true, enviado: true, espera: 45 }
  } catch (e) {
    await db.rpc('descartar_codigo_link', { p_id: r.id })
    console.error('[link] enviar código', e instanceof ErroUazapi ? e.message : e)
    return { ok: false, mensagem: 'Não conseguimos mandar o código no seu WhatsApp agora. Tente de novo em alguns minutos ou fale com a loja.' }
  }
}

export type ResultadoConferencia = { ok: true } | { ok: false; mensagem: string; pedirOutro?: boolean }

type RespostaConferencia = { ok: boolean; motivo?: 'expirado' | 'tentativas' | 'errado'; restantes?: number }

/** Confere o código digitado. Certo → o aparelho fica confirmado (cookie de 90 dias). */
export async function conferirCodigo(whatsapp: string, codigo: string): Promise<ResultadoConferencia> {
  const numero = normalizarWhatsapp(whatsapp)
  const digitos = codigo.replace(/\D/g, '')
  if (!numero) return { ok: false, mensagem: 'Confira o número: DDD + celular.' }
  if (digitos.length !== 6) return { ok: false, mensagem: 'O código tem 6 números.' }

  const token = randomBytes(32).toString('base64url')
  const { data, error } = await createAdminClient().rpc('conferir_codigo_link', {
    p_whatsapp: numero,
    p_codigo_hash: hashDoCodigo(numero, digitos),
    p_token_hash: hashDoToken(token),
    p_dias: DIAS_APARELHO_LEMBRADO,
  })
  if (error) {
    console.error('[link] conferir código', error.message)
    return { ok: false, mensagem: 'Não conseguimos conferir o código agora. Tente de novo em instantes.' }
  }

  const r = (data ?? {}) as RespostaConferencia
  if (!r.ok) {
    if (r.motivo === 'errado') {
      const restantes = Math.max(Number(r.restantes) || 0, 0)
      return restantes > 0
        ? { ok: false, mensagem: `Código errado. Confira no seu WhatsApp (${restantes === 1 ? 'resta 1 tentativa' : `restam ${restantes} tentativas`}).` }
        : { ok: false, mensagem: 'Código errado. Peça um código novo.', pedirOutro: true }
    }
    if (r.motivo === 'tentativas') return { ok: false, mensagem: 'Muitas tentativas com este código. Peça um código novo.', pedirOutro: true }
    return { ok: false, mensagem: 'Este código venceu. Peça um código novo.', pedirOutro: true }
  }

  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DIAS_APARELHO_LEMBRADO * 24 * 60 * 60,
  })
  return { ok: true }
}

/** Comparação de números sem vazar tempo (o WhatsApp do pedido × o do aparelho). */
export function mesmoNumero(a: string | null | undefined, b: string | null | undefined) {
  const x = Buffer.from(normalizarWhatsapp(a) ?? '')
  const y = Buffer.from(normalizarWhatsapp(b) ?? '')
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}
