import { createBrowserClient } from '@supabase/ssr'

import { envPublico } from '@/lib/env'
import type { Database } from '@/types/database.types'

/** Cliente Supabase para Client Components (usa a sessão dos cookies). */
export function createClient() {
  return createBrowserClient<Database>(envPublico.supabaseUrl, envPublico.supabasePublishableKey)
}
