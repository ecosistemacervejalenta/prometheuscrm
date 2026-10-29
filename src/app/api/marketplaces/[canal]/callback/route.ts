import { NextResponse, type NextRequest } from 'next/server'

import { segredosIguais } from '@/features/integracoes/api-auth'
import { caminhoCallback, cookieAutorizacao, marketplaceDoSlug } from '@/features/marketplaces/canais'
import { pedirARotinaMarketplaces } from '@/features/marketplaces/disparo'
import { obterSessao } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'

/**
 * Retorno da autorização do Mercado Livre (?code&state) ou da Shopee (?code&shop_id&state):
 * confere o `state` (anti-CSRF) e pede à rotina para trocar o código pelos tokens —
 * só ela lê a chave secreta do app.
 */
export async function GET(request: NextRequest, contexto: RouteContext<'/api/marketplaces/[canal]/callback'>) {
  const site = await urlDoSite()
  const { canal: slug } = await contexto.params
  const canal = marketplaceDoSlug(slug)
  const voltar = (status: string) => {
    const resposta = NextResponse.redirect(`${site}/configuracoes/marketplaces?marketplace=${slug}&status=${status}`)
    resposta.cookies.set(cookieAutorizacao(slug), '', { path: '/api/marketplaces', maxAge: 0 })
    return resposta
  }
  if (!canal) return NextResponse.redirect(`${site}/configuracoes/marketplaces`)

  const { searchParams } = request.nextUrl
  if (searchParams.get('error')) return voltar('cancelado')

  const codigo = searchParams.get('code')
  const estado = searchParams.get('state')
  const [estadoSalvo, verificador] = (request.cookies.get(cookieAutorizacao(slug))?.value ?? '').split('.')
  if (!codigo || !estado || !estadoSalvo || !segredosIguais(estado, estadoSalvo)) return voltar('erro-estado')

  const sessao = await obterSessao()
  if (!sessao?.perfil || sessao.perfil.papel !== 'admin') return voltar('apenas-admin')

  const resultado = await pedirARotinaMarketplaces(site, {
    acao: 'conectar',
    canal,
    codigo,
    redirectUri: `${site}${caminhoCallback(canal)}`,
    verificador,
    contaId: searchParams.get('shop_id') ?? undefined,
    perfilId: sessao.perfil.id,
  })
  return voltar(resultado.ok ? 'conectado' : 'erro-token')
}
