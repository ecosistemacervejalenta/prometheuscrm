import { z } from 'zod'

import {
  camposParcelamento,
  categoria,
  comCategoriaNova,
  dataFinanceira,
  dataFinanceiraOpcional,
  validarParcelamento,
} from '@/features/financeiro/schema'
import { checkbox, dinheiro, texto, textoOpcional } from '@/lib/validacao'

const pagador = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
  z.string().max(120, 'Use no máximo 120 caracteres.').nullable(),
)

/** Conta a receber nova, com opção de parcelar (uma conta por mês). */
export const esquemaContaReceber = comCategoriaNova(
  z
    .object({
      ...camposParcelamento,
      categoria,
      pagador,
      ja_recebida: checkbox,
      forma_pagamento: textoOpcional,
      observacoes: textoOpcional,
    })
    .superRefine(validarParcelamento),
)

/** Edição de uma conta a receber. */
export const esquemaEdicaoContaReceber = comCategoriaNova(
  z.object({
    descricao: texto('Descreva a conta.').max(200, 'Use no máximo 200 caracteres.'),
    categoria,
    pagador,
    valor: dinheiro('Informe o valor.'),
    vencimento: dataFinanceira('Informe o vencimento.'),
    status: z.enum(['pendente', 'recebida', 'cancelada'], { error: 'Situação inválida.' }),
    recebido_em: dataFinanceiraOpcional,
    forma_pagamento: textoOpcional,
    observacoes: textoOpcional,
  }),
)
