import { z } from 'zod'

import { localParaISO } from '@/lib/datas'
import { dataOpcional, dinheiroOpcional, texto, textoOpcional } from '@/lib/validacao'

const inteiroOuNulo = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive('Use um número maior que zero.').nullable(),
)

export const esquemaItemPreVenda = z.object({
  produto_id: z.uuid(),
  preco: z.number().min(0, 'Preço inválido.'),
  limite_por_cliente: inteiroOuNulo,
  quantidade_disponivel: inteiroOuNulo,
})

export const esquemaPreVenda = z.object({
  titulo: texto('Dê um título para a pré-venda.'),
  descricao: textoOpcional,
  slug: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null),
    z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens.')
      .min(3, 'Mínimo de 3 caracteres.')
      .max(60, 'Máximo de 60 caracteres.')
      .nullable(),
  ),
  canal: z.enum(['grupo_vip', 'whatsapp', 'loja', 'shopify', 'app']),
  status: z.enum(['rascunho', 'ativa', 'encerrada']),
  encerra_em: z.preprocess((v) => localParaISO(typeof v === 'string' ? v : null), z.string().nullable()),
  previsao_entrega: dataOpcional,
  taxa_entrega: dinheiroOpcional,
  itens: z.preprocess(
    (v) => {
      try {
        return JSON.parse(String(v ?? '[]'))
      } catch {
        return []
      }
    },
    z.array(esquemaItemPreVenda).min(1, 'Selecione pelo menos uma cerveja.'),
  ),
})
