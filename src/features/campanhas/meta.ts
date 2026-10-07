/**
 * Variáveis da API Cloud da Meta (WhatsApp oficial) cadastradas na Vercel.
 * Lista compartilhada entre o servidor (que confere quais existem) e o
 * passo a passo de Configurações › WhatsApp oficial.
 */
export const VARIAVEIS_META = [
  { nome: 'META_WHATSAPP_TOKEN', exemplo: 'cole_o_token_permanente', descricao: 'Token permanente do usuário do sistema' },
  { nome: 'META_WHATSAPP_PHONE_NUMBER_ID', exemplo: 'cole_o_id_do_numero', descricao: 'Identificação do número de telefone' },
  { nome: 'META_WHATSAPP_WABA_ID', exemplo: 'cole_o_id_da_conta', descricao: 'Identificação da conta do WhatsApp Business' },
  { nome: 'META_APP_SECRET', exemplo: 'cole_a_chave_secreta_do_app', descricao: 'Chave secreta do app (confere a assinatura do webhook)' },
  { nome: 'META_WEBHOOK_VERIFY_TOKEN', exemplo: '', descricao: 'Senha que você cria para a Meta validar o webhook' },
] as const

export type NomeVariavelMeta = (typeof VARIAVEIS_META)[number]['nome']

export type StatusMeta = {
  /** Quais variáveis o servidor encontrou. */
  variaveis: Record<NomeVariavelMeta, boolean>
  /** Todas as variáveis cadastradas. */
  configurado: boolean
}
