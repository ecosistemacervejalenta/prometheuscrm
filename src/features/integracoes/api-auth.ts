import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/** Compara segredos em tempo constante (evita ataques de tempo). */
export function segredosIguais(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Lê "Authorization: Bearer <token>" (ou o header x-api-key). */
export function tokenDaRequisicao(request: Request): string | null {
  const auth = request.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return request.headers.get('x-api-key')
}

/** Retorna uma resposta 401/503 se a requisição não estiver autorizada; senão null. */
export function verificarChave(request: Request, chaveEsperada: string | undefined, nome: string) {
  if (!chaveEsperada) {
    return NextResponse.json({ erro: `${nome} não configurada no servidor.` }, { status: 503 })
  }
  const token = tokenDaRequisicao(request)
  if (!token || !segredosIguais(token, chaveEsperada)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  return null
}

export function erroJson(mensagem: string, status = 400) {
  return NextResponse.json({ erro: mensagem }, { status })
}
