import type { VercelConfig } from '@vercel/config/v1'

/**
 * Configuração do projeto na Vercel.
 * - framework: Next.js (detectado automaticamente, deixado explícito).
 * - crons: reenvio da fila de eventos (webhooks n8n) e sincronização do Olist ERP. A Vercel envia
 *   "Authorization: Bearer $CRON_SECRET" automaticamente quando CRON_SECRET existe.
 *   No plano Hobby o cron roda no máximo 1x/dia; no Pro use, por exemplo, "* /5 * * * *" (sem espaço).
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  regions: ['gru1'], // São Paulo — mais perto dos clientes e do Supabase sa-east-1
  crons: [
    { path: '/api/cron/eventos', schedule: '0 9 * * *' },
    // Olist ERP: sincroniza as vendas e renova o token (o refresh vale 1 dia).
    // Seis rotinas diárias (cada uma 1x/dia, compatível com o Hobby) = a cada ~4 h.
    ...[1, 5, 9, 13, 17, 21].map((hora) => ({ path: `/api/cron/olist?h=${hora}`, schedule: `0 ${hora} * * *` })),
  ],
}
