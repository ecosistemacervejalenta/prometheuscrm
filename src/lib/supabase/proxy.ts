import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { envPublico } from '@/lib/env'
import type { Database } from '@/types/database.types'

/** Rotas acessíveis sem login. */
const ROTAS_PUBLICAS = ['/login', '/redefinir-senha', '/p/', '/auth/', '/api/']

function ehPublica(pathname: string) {
  return ROTAS_PUBLICAS.some((rota) => pathname === rota.replace(/\/$/, '') || pathname.startsWith(rota))
}

/**
 * Renova a sessão do Supabase a cada navegação e protege as rotas do CRM.
 * Chamado por `src/proxy.ts`.
 */
export async function atualizarSessao(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    envPublico.supabaseUrl,
    envPublico.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([chave, valor]) => response.headers.set(chave, valor))
        },
      },
    },
  )

  // Não coloque código entre createServerClient e getClaims: a renovação da sessão depende disso.
  const { data } = await supabase.auth.getClaims()
  const logado = Boolean(data?.claims)
  const { pathname } = request.nextUrl

  if (!logado && !ehPublica(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = pathname === '/' ? '' : `?voltar=${encodeURIComponent(pathname + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }

  if (logado && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
