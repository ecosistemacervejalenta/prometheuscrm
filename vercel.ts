import type { VercelConfig } from '@vercel/config/v1'

/**
 * Configuração do projeto na Vercel.
 * - framework: Next.js (detectado automaticamente, deixado explícito).
 * - crons: reenvio da fila de eventos (webhooks n8n). A Vercel envia
 *   "Authorization: Bearer $CRON_SECRET" automaticamente quando CRON_SECRET existe.
 *   No plano Hobby o cron roda no máximo 1x/dia; no Pro use, por exemplo, "* /5 * * * *" (sem espaço).
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  regions: ['gru1'], // São Paulo — mais perto dos clientes e do Supabase sa-east-1
  crons: [{ path: '/api/cron/eventos', schedule: '0 9 * * *' }],
}
