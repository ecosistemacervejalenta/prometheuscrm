import type { PostgrestError } from '@supabase/supabase-js'
import type { z } from 'zod'

/**
 * Estado padrão devolvido pelas Server Actions dos formulários.
 *   ok        → operação concluída
 *   mensagem  → texto para o usuário (erro geral ou confirmação)
 *   erros     → erros por campo (exibidos abaixo de cada input)
 */
export type EstadoAcao = {
  ok?: boolean
  mensagem?: string
  erros?: Record<string, string[] | undefined>
}

export const estadoInicial: EstadoAcao = {}

export function falha(mensagem: string): EstadoAcao {
  return { ok: false, mensagem }
}

export function sucesso(mensagem?: string): EstadoAcao {
  return { ok: true, mensagem }
}

export function errosDeValidacao(erro: z.ZodError): EstadoAcao {
  const erros: Record<string, string[]> = {}
  for (const issue of erro.issues) {
    const campo = issue.path.join('.') || '_'
    ;(erros[campo] ??= []).push(issue.message)
  }
  return { ok: false, mensagem: 'Revise os campos destacados.', erros }
}

const RESTRICOES: Record<string, string> = {
  clientes_whatsapp_key: 'Já existe um cliente com este WhatsApp.',
  clientes_shopify_customer_id_key: 'Já existe um cliente com este ID da Shopify.',
  fornecedores_cnpj_key: 'Já existe um fornecedor com este CNPJ.',
  categorias_financeiras_nome_key: 'Já existe uma categoria com este nome.',
  leads_pastas_nome_key: 'Já existe uma pasta com este nome.',
  leads_listas_nome_key: 'Já existe uma lista com este nome nesta pasta.',
  leads_listas_pasta_id_fkey: 'Esta pasta ainda tem listas (ou não existe mais). Exclua ou mova as listas antes de excluir a pasta.',
  categorias_financeiras_nome_check: 'O nome da categoria deve ter de 1 a 60 caracteres.',
  produtos_sku_key: 'Já existe um produto com este SKU.',
  produtos_shopify_variant_id_key: 'Já existe um produto com esta variante da Shopify.',
  pre_vendas_slug_key: 'Este endereço de link já está em uso. Escolha outro.',
  pre_vendas_slug_formato: 'Link inválido: use letras minúsculas, números e hífens.',
  atendimentos_aberto_por_contato: 'Este contato já tem outro atendimento aberto. Continue por ele.',
  atendimento_eventos_texto_check: 'A nota deve ter de 1 a 4.000 caracteres.',
}

/** Traduz erros do Supabase/Postgres em mensagens claras em português. */
export function traduzirErro(erro: PostgrestError | { message: string; code?: string } | null): string {
  if (!erro) return 'Erro desconhecido.'
  const restricao = Object.keys(RESTRICOES).find((nome) => erro.message.includes(nome))
  if (restricao) return RESTRICOES[restricao]

  switch (erro.code) {
    case 'P0001': // raise exception das funções de negócio (mensagem já em pt-BR)
      return erro.message
    case '23505':
      return 'Já existe um registro com estes dados.'
    case '23503':
      return 'Este registro está vinculado a outros dados e não pode ser excluído.'
    case '23514':
      return 'Algum valor informado é inválido.'
    case '42501':
      return 'Você não tem permissão para esta ação.'
    case 'PGRST116':
      return 'Registro não encontrado.'
    default:
      return 'Não foi possível concluir a operação. Tente novamente.'
  }
}
