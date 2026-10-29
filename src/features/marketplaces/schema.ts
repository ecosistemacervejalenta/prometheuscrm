import { z } from 'zod'

/** ID do app (Mercado Livre: Client ID · Shopee: Live Partner ID) e a chave secreta. */
export const esquemaCredenciais = z.object({
  canal: z.enum(['mercado_livre', 'shopee']),
  client_id: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s/g, '') : v),
    z.string({ error: 'Cole o ID do app.' }).regex(/^\d{4,25}$/, 'O ID do app tem só números — confira se copiou inteiro.'),
  ),
  // Vazia mantém a chave já salva.
  segredo: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim() : null),
    z.string().max(200, 'Chave grande demais — confira o que foi copiado.').nullable(),
  ),
})
