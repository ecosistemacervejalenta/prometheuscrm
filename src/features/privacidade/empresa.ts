/**
 * Dados da empresa na Política de Privacidade (/privacidade) e nas mensagens automáticas.
 *
 * TEXTO BASE (2026-11-25) — em revisão pelo jurídico. Os campos `null` aparecem na página
 * como "[a preencher]" até alguém completar aqui.
 */
export const EMPRESA = {
  /** Nome que o cliente conhece (o mesmo da foto de perfil do link). */
  nomeFantasia: 'Cerveja Lenta VIP',
  razaoSocial: null as string | null,
  cnpj: null as string | null,
  endereco: null as string | null,
  /** E-mail para pedidos sobre dados pessoais (art. 18 da LGPD). */
  emailPrivacidade: null as string | null,
  /** Encarregado (DPO). Agente de pequeno porte pode não indicar (Res. CD/ANPD nº 2/2022), mas precisa de um canal. */
  encarregado: null as string | null,
  /** Data da versão em vigor (AAAA-MM-DD). */
  atualizadaEm: '2026-11-25',
}

/** Quanto tempo o aparelho confirmado fica lembrado no link da pré-venda. */
export const DIAS_APARELHO_LEMBRADO = 90
/** Validade do código de confirmação enviado no WhatsApp. */
export const MINUTOS_CODIGO = 10
