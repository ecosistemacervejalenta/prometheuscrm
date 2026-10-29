import { createHash, randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { caminhoCallback, cookieAutorizacao, marketplaceDoSlug, MARKETPLACES } from '@/features/marketplaces/canais'
import * as mercadoLivre from '@/features/marketplaces/mercado-livre'
import * as shopee from '@/features/marketplaces/shopee'
import { obterSessao } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'

/** Leva o administrador à tela de autorização do Mercado Livre ou da Shopee. */
export async function GET(_: NextRequest, contexto: RouteContext<'/api/marketplaces/[canal]/conectar'>) {
  const site = await urlDoSite()
  const { canal: slug } = await contexto.params
  const canal = marketplaceDoSlug(slug)
  const voltar = (status: string) =>
    NextResponse.redirect(`${site}/configuracoes/marketplaces?marketplace=${slug}&status=${status}`)
  if (!canal) return NextResponse.redirect(`${site}/configuracoes/marketplaces`)

  const sessao = await obterSessao()
  if (!sessao) return NextResponse.redirect(`${site}/login`)
  if (sessao.perfil?.papel !== 'admin') return voltar('apenas-admin')

  const { data } = await sessao.supabase.rpc('status_marketplaces')
  const status = (data as Record<string, { configurado?: boolean; client_id?: string | null }> | null)?.[canal]
  if (!status?.configurado || !status.client_id) return voltar('sem-credenciais')

  const estado = randomBytes(24).toString('hex')
  const verificador = randomBytes(48).toString('base64url')
  const redirectUri = `${site}${caminhoCallback(canal)}`
  const destino =
    canal === 'mercado_livre'
      ? mercadoLivre.urlDeAutorizacao(status.client_id, redirectUri, estado, createHash('sha256').update(verificador).digest('base64url'))
      : shopee.urlDeAutorizacao(status.client_id, redirectUri, estado)

  const resposta = NextResponse.redirect(destino)
  resposta.cookies.set(cookieAutorizacao(MARKETPLACES[canal].slug), `${estado}.${verificador}`, {
    httpOnly: true,
    secure: site.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/marketplaces',
    maxAge: 900,
  })
  return resposta
}
