/**
 * Variáveis de ambiente públicas (disponíveis no navegador e no servidor).
 * As variáveis secretas ficam em `env.server.ts`.
 *
 * Importante: o Next.js só embute no bundle do navegador variáveis acessadas
 * de forma literal (`process.env.NEXT_PUBLIC_...`), por isso não usamos acesso dinâmico.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nome} não configurada. Copie .env.example para .env.local e preencha os valores.`,
    )
  }
  return valor
}

export const envPublico = {
  get supabaseUrl() {
    return obrigatoria('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
  },
  get supabasePublishableKey() {
    return obrigatoria(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    )
  },
  /** URL pública do CRM (usada nos links de pré-venda). Opcional: cai para o host da requisição. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || undefined,
}

export { obrigatoria }
