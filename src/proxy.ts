import type { NextRequest } from 'next/server'

import { atualizarSessao } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return atualizarSessao(request)
}

export const config = {
  matcher: [
    // Tudo, exceto arquivos estáticos, imagens otimizadas e ícones.
    '/((?!_next/static|_next/image|brand/|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
}
