import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { envPublico } from '@/lib/env'
import { envServidor } from '@/lib/env.server'
import type { Database } from '@/types/database.types'

/**
 * Cliente com a chave SECRETA (service role): ignora o RLS.
 * Use somente no servidor e apenas onde não há usuário logado:
 * link público de pré-venda, webhooks, API /api/v1 e fila de eventos.
 */
export function createAdminClient() {
  return createClient<Database>(envPublico.supabaseUrl, envServidor.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
