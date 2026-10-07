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
  /** WhatsApp da loja (uazapi): Server URL e token da instância (não o admin token). */
  uazapiUrl: process.env.UAZAPI_URL?.trim().replace(/\/+$/, '') || undefined,
  uazapiToken: process.env.UAZAPI_TOKEN?.trim() || undefined,
  /** WhatsApp oficial (API Cloud da Meta), número exclusivo das Campanhas. */
  metaWhatsappToken: process.env.META_WHATSAPP_TOKEN?.trim() || undefined,
  metaPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined,
  metaWabaId: process.env.META_WHATSAPP_WABA_ID?.trim() || undefined,
  metaAppSecret: process.env.META_APP_SECRET?.trim() || undefined,
  metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || undefined,
}
