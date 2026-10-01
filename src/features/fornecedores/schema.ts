import { z } from 'zod'

import {
  checkbox,
  emailOpcional,
  listaPorVirgula,
  texto,
  textoOpcional,
  ufOpcional,
  uuid,
  whatsappOpcional,
} from '@/lib/validacao'

export const esquemaFornecedor = z.object({
  nome: texto('Informe o nome da empresa.'),
  razao_social: textoOpcional,
  cnpj: z.preprocess(
    (v) => (typeof v === 'string' && v.replace(/\D/g, '') !== '' ? v.replace(/\D/g, '') : null),
    z.string().length(14, 'CNPJ deve ter 14 dígitos.').nullable(),
  ),
  telefone: textoOpcional,
  email: emailOpcional,
  site: textoOpcional,
  cidade: textoOpcional,
  uf: ufOpcional,
  observacoes: textoOpcional,
  ativo: checkbox,
})

export const esquemaVendedor = z.object({
  nome: texto('Informe o nome do vendedor.'),
  whatsapp: whatsappOpcional,
  email: emailOpcional,
  observacoes: textoOpcional,
  ativo: checkbox,
  fornecedor_ids: z.array(uuid).default([]),
  novas_empresas: listaPorVirgula,
})
