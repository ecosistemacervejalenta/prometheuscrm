import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * Confirma links enviados por e-mail (convite da equipe e recuperação de senha).
 * Aceita os dois formatos do Supabase:
 *   ?token_hash=...&type=invite|recovery   (template de e-mail recomendado — ver README)
 *   ?code=...                              (fluxo PKCE)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const tipo = searchParams.get('type') as EmailOtpType | null
  const codigo = searchParams.get('code')
  const proximo = searchParams.get('next') ?? '/'
  const destino = proximo.startsWith('/') && !proximo.startsWith('//') ? proximo : '/'

  const supabase = await createClient()

  const { error } = tokenHash && tipo
    ? await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
    : codigo
      ? await supabase.auth.exchangeCodeForSession(codigo)
      : { error: new Error('Link sem token') }

  if (error) return NextResponse.redirect(new URL('/login?erro=link-invalido', origin))
  return NextResponse.redirect(new URL(destino, origin))
}
