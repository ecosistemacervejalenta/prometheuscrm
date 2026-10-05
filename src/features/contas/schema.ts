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

const fornecedorOpcional = z.preprocess((v) => (v ? String(v) : null), z.uuid('Fornecedor inválido.').nullable())

/** "YYYY-MM" (input type="month") → "YYYY-MM-01". */
const mes = (v: unknown) => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? `${v}-01` : null)
const mesNoIntervalo = (d: string) => d >= '2000-01-01' && d <= '2099-12-01'

/** Conta variável (avulsa), com opção de parcelar mês a mês. */
export const esquemaContaVariavel = comCategoriaNova(
  z
    .object({
      ...camposParcelamento,
      categoria,
      fornecedor_id: fornecedorOpcional,
      ja_paga: checkbox,
      forma_pagamento: textoOpcional,
      observacoes: textoOpcional,
    })
    .superRefine(validarParcelamento),
)

/** Conta fixa (modelo recorrente). Valor 0 é aceito para contas que mudam todo mês. */
export const esquemaContaFixa = comCategoriaNova(
  z
    .object({
      descricao: texto('Descreva a conta.').max(200, 'Use no máximo 200 caracteres.'),
      categoria,
      fornecedor_id: fornecedorOpcional,
      valor: dinheiro('Informe o valor.'),
      dia_vencimento: z.coerce
        .number({ error: 'Informe o dia.' })
        .int('Dia entre 1 e 31.')
        .min(1, 'Dia entre 1 e 31.')
        .max(31, 'Dia entre 1 e 31.'),
      inicio_em: z.preprocess(
        mes,
        z.string({ error: 'Informe o mês de início.' }).refine(mesNoIntervalo, 'Use um mês entre 2000 e 2099.'),
      ),
      fim_em: z.preprocess(mes, z.string().refine(mesNoIntervalo, 'Use um mês entre 2000 e 2099.').nullable()),
      ativa: checkbox,
      observacoes: textoOpcional,
      atualizar_pendentes: checkbox,
    })
    .refine((d) => !d.fim_em || d.fim_em >= d.inicio_em, {
      path: ['fim_em'],
      message: 'O último mês não pode ser antes do primeiro.',
    }),
)

/** Edição de uma conta do mês (fixa gerada ou variável). */
export const esquemaEdicaoConta = comCategoriaNova(
  z.object({
    descricao: texto('Descreva a conta.').max(200, 'Use no máximo 200 caracteres.'),
    categoria,
    fornecedor_id: fornecedorOpcional,
    valor: dinheiro('Informe o valor.'),
    vencimento: dataFinanceira('Informe o vencimento.'),
    status: z.enum(['pendente', 'paga', 'cancelada'], { error: 'Situação inválida.' }),
    pago_em: dataFinanceiraOpcional,
    forma_pagamento: textoOpcional,
    observacoes: textoOpcional,
  }),
)
