import { z } from 'zod'

import { checkbox, dinheiro, inteiroOpcional, texto, textoOpcional } from '@/lib/validacao'

export const esquemaProduto = z.object({
  nome: texto('Informe o nome da cerveja.'),
  estilo: textoOpcional,
  cervejaria: textoOpcional,
  fornecedor_id: z.preprocess((v) => (v ? String(v) : null), z.uuid().nullable()),
  volume_ml: z.preprocess((v) => (v === null ? null : v), inteiroOpcional),
  teor_alcoolico: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : null),
    z.number().min(0, 'Teor inválido.').max(99, 'Teor inválido.').nullable(),
  ),
  preco: dinheiro('Informe o preço.'),
  sku: textoOpcional,
  descricao: textoOpcional,
  imagem_url: textoOpcional,
  ativo: checkbox,
  shopify_product_id: textoOpcional,
  shopify_variant_id: textoOpcional,
})

export const TAMANHO_MAXIMO_IMAGEM = 4 * 1024 * 1024
export const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/avif']
