import 'server-only'

import { obrigatoria } from './env'

/** Variáveis secretas — nunca importe este arquivo em componentes de cliente. */
export const envServidor = {
  get supabaseSecretKey() {
    return obrigatoria('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY)
  },
  /** Chave da API /api/v1 (n8n, App, automações). */
  apiKey: process.env.INTEGRATIONS_API_KEY || undefined,
  /** Segredo enviado pela Vercel Cron (ou pelo n8n) para /api/cron/*. */
  cronSecret: process.env.CRON_SECRET || undefined,
  /** Segredo de assinatura dos webhooks da Shopify. */
  shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || undefined,
  /** Aplicativo da API v3 do Olist ERP (Menu › Configurações › Geral › Aplicativos). */
  olistClientId: process.env.OLIST_CLIENT_ID || undefined,
  olistClientSecret: process.env.OLIST_CLIENT_SECRET || undefined,
}
