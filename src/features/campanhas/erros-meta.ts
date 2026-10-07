/**
 * Erros da API do WhatsApp (Meta) → o que fazer e como explicar à equipe.
 * Ref.: developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
 *
 *   repetir → falha passageira: volta para a fila e sai numa próxima rodada.
 *   contato → problema só daquele número: o envio fica como "falhou".
 *   conta   → problema da conta, do número ou da mensagem: a campanha pausa.
 */
export type ClasseErro = 'repetir' | 'contato' | 'conta'

/** O contato bloqueou mensagens de marketing da loja no próprio WhatsApp. */
export const ERRO_SAIU_DO_MARKETING = 131050

const ERROS: Record<number, { classe: ClasseErro; mensagem: string }> = {
  // Passageiros
  2: { classe: 'repetir', mensagem: 'A Meta ficou indisponível por um momento.' },
  4: { classe: 'repetir', mensagem: 'Muitas chamadas à Meta em pouco tempo.' },
  80007: { classe: 'repetir', mensagem: 'Muitas chamadas à Meta em pouco tempo.' },
  130429: { classe: 'repetir', mensagem: 'Velocidade de envio acima do permitido pela Meta.' },
  131000: { classe: 'repetir', mensagem: 'Erro desconhecido na Meta.' },
  131016: { classe: 'repetir', mensagem: 'A Meta ficou indisponível por um momento.' },
  133004: { classe: 'repetir', mensagem: 'A Meta ficou indisponível por um momento.' },
  131056: { classe: 'repetir', mensagem: 'Mensagens demais para o mesmo número em pouco tempo.' },
  131057: { classe: 'repetir', mensagem: 'A conta está em manutenção na Meta (cerca de 1 minuto).' },
  // Do contato
  131026: { classe: 'contato', mensagem: 'Número sem WhatsApp ou com o aplicativo desatualizado.' },
  131049: { classe: 'contato', mensagem: 'A Meta segurou a mensagem: o contato já recebeu muito marketing hoje.' },
  [ERRO_SAIU_DO_MARKETING]: { classe: 'contato', mensagem: 'O contato bloqueou mensagens de marketing da loja.' },
  130472: { classe: 'contato', mensagem: 'Número em teste da Meta — não recebe marketing agora.' },
  130497: { classe: 'contato', mensagem: 'A conta não pode enviar para o país deste número.' },
  131021: { classe: 'contato', mensagem: 'O número de destino é o próprio número da loja.' },
  // Da conta, do número ou da mensagem
  100: { classe: 'conta', mensagem: 'A Meta recusou os dados da mensagem.' },
  131008: { classe: 'conta', mensagem: 'Falta um dado obrigatório na mensagem.' },
  131009: { classe: 'conta', mensagem: 'Um dado da mensagem está inválido.' },
  132000: { classe: 'conta', mensagem: 'A mensagem não bate com o modelo aprovado.' },
  132001: { classe: 'conta', mensagem: 'O modelo da mensagem não existe ou ainda não foi aprovado.' },
  132012: { classe: 'conta', mensagem: 'Um dado da mensagem está no formato errado.' },
  132018: { classe: 'conta', mensagem: 'Um dado da mensagem está inválido.' },
  132015: { classe: 'conta', mensagem: 'A Meta pausou esta mensagem por baixa qualidade (muitos bloqueios ou denúncias).' },
  132016: { classe: 'conta', mensagem: 'A Meta desativou esta mensagem de vez. Crie uma campanha com outro texto.' },
  131042: { classe: 'conta', mensagem: 'Problema no pagamento da conta do WhatsApp — confira o cartão no Gerenciador do WhatsApp.' },
  131048: { classe: 'conta', mensagem: 'A Meta limitou o número por excesso de bloqueios ou denúncias. Espere algumas horas.' },
  131031: { classe: 'conta', mensagem: 'A conta do WhatsApp está bloqueada na Meta.' },
  131053: { classe: 'conta', mensagem: 'A Meta não conseguiu baixar a foto da campanha.' },
  131064: { classe: 'conta', mensagem: 'A conta está penalizada por uso de categoria errada nos modelos.' },
  368: { classe: 'conta', mensagem: 'A conta foi restringida por violar as políticas da Meta.' },
  190: { classe: 'conta', mensagem: 'O token da Meta venceu ou foi revogado. Gere outro e salve em Configurações › WhatsApp oficial.' },
  10: { classe: 'conta', mensagem: 'O token não tem permissão para esta conta do WhatsApp.' },
  200: { classe: 'conta', mensagem: 'O token não tem permissão para esta conta do WhatsApp.' },
  133010: { classe: 'conta', mensagem: 'O número não está registrado na API. Informe o PIN de 6 dígitos em Configurações › WhatsApp oficial.' },
  133005: { classe: 'conta', mensagem: 'PIN da confirmação em duas etapas incorreto.' },
  133016: { classe: 'conta', mensagem: 'Tentativas de registro demais: a Meta bloqueou novas tentativas por 72 horas.' },
}

/** Erros que não estão na lista: falha só daquele contato (não trava a campanha). */
export function classeDoErro(codigo: number | null): ClasseErro {
  if (codigo === null) return 'repetir'
  return ERROS[codigo]?.classe ?? 'contato'
}

export function mensagemDoErro(codigo: number | null, original?: string | null): string {
  if (codigo !== null && ERROS[codigo]) return ERROS[codigo].mensagem
  return original?.trim() ? `Meta: ${original.trim()}` : 'A Meta não informou o motivo.'
}

/** Motivos de recusa do modelo pela Meta. */
const MOTIVOS_RECUSA: Record<string, string> = {
  ABUSIVE_CONTENT: 'A Meta considerou o conteúdo abusivo.',
  INCORRECT_CATEGORY: 'A Meta entendeu que a categoria da mensagem está errada.',
  INVALID_FORMAT: 'Formato inválido — confira variáveis, emojis em excesso ou links quebrados.',
  PROMOTIONAL: 'Conteúdo promocional fora da categoria de marketing.',
  SCAM: 'A Meta suspeitou de golpe na mensagem.',
  TAG_CONTENT_MISMATCH: 'O texto não combina com a categoria da mensagem.',
  CATEGORY_NOT_AVAILABLE: 'Categoria indisponível para esta conta.',
}

export function motivoDaRecusa(motivo: string | null | undefined): string {
  if (!motivo || motivo === 'NONE') return 'A Meta não informou o motivo.'
  return MOTIVOS_RECUSA[motivo] ?? `Motivo informado pela Meta: ${motivo}.`
}
