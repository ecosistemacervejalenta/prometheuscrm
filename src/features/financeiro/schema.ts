import { z } from 'zod'

import { data, dinheiro, texto } from '@/lib/validacao'

import { NOVA_CATEGORIA, type ModoValor } from './regras'

/** Blocos de validação compartilhados por contas a pagar e a receber. */

/** Categoria escolhida na lista (ou digitada em "Nova categoria", via `comCategoriaNova`). */
export const categoria = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''),
  z
    .string()
    .min(1, 'Escolha uma categoria ou cadastre uma nova.')
    .max(60, 'Use no máximo 60 caracteres.')
    .refine((v) => v !== NOVA_CATEGORIA, 'Digite o nome da nova categoria.'),
)

/** Troca o valor especial "+ Nova categoria" do <select> pelo nome digitado. */
export function comCategoriaNova<T extends z.ZodType>(esquema: T) {
  return z.preprocess((v) => {
    if (!v || typeof v !== 'object') return v
    const { categoria_nova, ...resto } = v as Record<string, unknown>
    const nova = typeof categoria_nova === 'string' ? categoria_nova.trim() : ''
    return resto.categoria === NOVA_CATEGORIA && nova ? { ...resto, categoria: nova } : resto
  }, esquema)
}

/** Data "YYYY-MM-DD" obrigatória, dentro de um intervalo razoável (evita anos digitados errado). */
export const dataFinanceira = (mensagem: string) =>
  data(mensagem).refine((d) => d >= '2000-01-01' && d <= '2099-12-31', 'Use uma data entre 2000 e 2099.')

export const dataFinanceiraOpcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v : null),
  dataFinanceira('Data inválida.').nullable(),
)

export const valorPositivo = dinheiro('Informe o valor.').refine((v) => v > 0, 'O valor deve ser maior que zero.')

/** Campos do lançamento com parcelamento (valor, 1º vencimento, nº de parcelas e modo do valor). */
export const camposParcelamento = {
  descricao: texto('Descreva a conta.').max(200, 'Use no máximo 200 caracteres.'),
  valor: valorPositivo,
  vencimento: dataFinanceira('Informe o vencimento.'),
  parcelas: z.coerce
    .number({ error: 'Informe o número de parcelas.' })
    .int('Use um número inteiro.')
    .min(1, 'Mínimo 1 parcela.')
    .max(36, 'Máximo 36 parcelas.')
    .default(1),
  modo_valor: z.enum(['total', 'parcela']).catch('total'),
}

/** No modo "total", cada parcela precisa ter pelo menos 1 centavo. */
export function validarParcelamento(
  dados: { valor: number; parcelas: number; modo_valor: ModoValor },
  ctx: z.RefinementCtx,
) {
  if (dados.modo_valor === 'total' && Math.round(dados.valor * 100) < dados.parcelas) {
    ctx.addIssue({ code: 'custom', path: ['valor'], message: `Valor pequeno demais para ${dados.parcelas} parcelas.` })
  }
}

export const esquemaCategoria = z.object({
  natureza: z.enum(['pagar', 'receber'], { error: 'Escolha se é a pagar ou a receber.' }),
  nome: texto('Informe o nome da categoria.').max(60, 'Use no máximo 60 caracteres.'),
})

export const esquemaRenomearCategoria = z.object({
  nome: texto('Informe o nome da categoria.').max(60, 'Use no máximo 60 caracteres.'),
})
