import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'

import { COOKIE_ESTADO_OAUTH, olistConfigurado, urlDeAutorizacao } from '@/features/olist/oauth'
import { obterSessao } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'

/** Inicia o OAuth2: leva o administrador à tela de autorização do Olist. */
export async function GET() {
  const site = await urlDoSite()
  const voltar = (status: string) => NextResponse.redirect(`${site}/configuracoes/integracoes?olist=${status}`)

  const sessao = await obterSessao()
  if (!sessao) return NextResponse.redirect(`${site}/login`)
  if (sessao.perfil?.papel !== 'admin') return voltar('apenas-admin')
  if (!olistConfigurado()) return voltar('sem-credenciais')

  const estado = randomBytes(24).toString('hex')
  const resposta = NextResponse.redirect(urlDeAutorizacao(`${site}/api/olist/callback`, estado))
  resposta.cookies.set(COOKIE_ESTADO_OAUTH, estado, {
    httpOnly: true,
    secure: site.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/olist',
    maxAge: 600,
  })
  return resposta
}
