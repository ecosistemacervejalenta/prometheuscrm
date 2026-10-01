import { z } from 'zod'

import { checkbox, data, dataOpcional, dinheiro, texto, textoOpcional } from '@/lib/validacao'

const fornecedorOpcional = z.preprocess((v) => (v ? String(v) : null), z.uuid().nullable())
const categoria = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'Outros'), z.string())
const mesOpcional = z.preprocess(
  (v) => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : null),
  z.string().nullable(),
)

/** Conta variável (avulsa), com opção de parcelar mês a mês. */
export const esquemaContaVariavel = z.object({
  descricao: texto('Descreva a conta.'),
  categoria,
  fornecedor_id: fornecedorOpcional,
  valor: dinheiro('Informe o valor.'),
  vencimento: data('Informe o vencimento.'),
  parcelas: z.coerce.number().int().min(1, 'Mínimo 1 parcela.').max(36, 'Máximo 36 parcelas.').default(1),
  ja_paga: checkbox,
  forma_pagamento: textoOpcional,
  observacoes: textoOpcional,
})

/** Conta fixa (modelo recorrente). */
export const esquemaContaFixa = z.object({
  descricao: texto('Descreva a conta.'),
  categoria,
  fornecedor_id: fornecedorOpcional,
  valor: dinheiro('Informe o valor.'),
  dia_vencimento: z.coerce.number({ error: 'Informe o dia.' }).int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.'),
  inicio_em: z.preprocess(
    (v) => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : undefined),
    z.string({ error: 'Informe o mês de início.' }),
  ),
  fim_em: mesOpcional,
  ativa: checkbox,
  observacoes: textoOpcional,
  atualizar_pendentes: checkbox,
})

/** Edição de uma conta do mês (fixa gerada ou variável). */
export const esquemaEdicaoConta = z.object({
  descricao: texto('Descreva a conta.'),
  categoria,
  fornecedor_id: fornecedorOpcional,
  valor: dinheiro('Informe o valor.'),
  vencimento: data('Informe o vencimento.'),
  status: z.enum(['pendente', 'paga', 'cancelada']),
  pago_em: dataOpcional,
  forma_pagamento: textoOpcional,
  observacoes: textoOpcional,
})
