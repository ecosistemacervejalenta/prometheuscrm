import { after, NextResponse, type NextRequest } from 'next/server'

import { segredosIguais } from '@/features/integracoes/api-auth'
import { dispararSincronizacao } from '@/features/olist/disparo'
import { COOKIE_ESTADO_OAUTH, trocarCodigoPorTokens } from '@/features/olist/oauth'
import { obterSessao } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'

/**
 * Retorno do OAuth2 do Olist: confere o `state` (anti-CSRF), troca o código por
 * tokens, grava a conexão (função do banco restrita a administradores) e
 * dispara a primeira sincronização em segundo plano.
 */
export async function GET(request: NextRequest) {
  const site = await urlDoSite()
  const voltar = (status: string) => {
    const resposta = NextResponse.redirect(`${site}/configuracoes/integracoes?olist=${status}`)
    resposta.cookies.set(COOKIE_ESTADO_OAUTH, '', { path: '/api/olist', maxAge: 0 })
    return resposta
  }

  const { searchParams } = request.nextUrl
  if (searchParams.get('error')) return voltar('cancelado')

  const codigo = searchParams.get('code')
  const estado = searchParams.get('state')
  const estadoSalvo = request.cookies.get(COOKIE_ESTADO_OAUTH)?.value
  if (!codigo || !estado || !estadoSalvo || !segredosIguais(estado, estadoSalvo)) return voltar('erro-estado')

  const sessao = await obterSessao()
  if (!sessao?.perfil || sessao.perfil.papel !== 'admin') return voltar('apenas-admin')

  try {
    const tokens = await trocarCodigoPorTokens(codigo, `${site}/api/olist/callback`)
    const { error } = await sessao.supabase.rpc('salvar_conexao_olist', {
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_access_expira_em: tokens.accessExpiraEm,
      p_refresh_expira_em: tokens.refreshExpiraEm,
    })
    if (error) throw error
  } catch (erro) {
    console.error('[olist] falha ao concluir a conexão', erro)
    return voltar('erro-token')
  }

  after(() => dispararSincronizacao(site))
  return voltar('conectado')
}
