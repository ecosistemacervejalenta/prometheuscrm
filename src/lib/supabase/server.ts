import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { envPublico } from '@/lib/env'
import type { Database } from '@/types/database.types'

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a sessão do usuário logado (cookies) — o RLS do banco se aplica.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(envPublico.supabaseUrl, envPublico.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado a partir de um Server Component: o proxy.ts já renova a sessão.
        }
      },
    },
  })
}
