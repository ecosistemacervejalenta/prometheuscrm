import type { Tom } from '@/lib/rotulos'

/**
 * Conexão com a API Cloud da Meta como a tela vê (função status_whatsapp_oficial).
 * Nunca traz o token nem a chave secreta; o token de verificação do webhook só vem para admins.
 */
export type ConexaoMeta = {
  configurado: boolean
  tem_app_secret: boolean
  app_id: string | null
  phone_number_id: string | null
  waba_id: string | null
  numero: string | null
  nome_verificado: string | null
  qualidade: string | null
  limite_tier: string | null
  status_nome: string | null
  conectado_em: string | null
  verificado_em: string | null
  webhook_recebido_em: string | null
  ultimo_erro: string | null
  token_verificacao: string | null
}

/** Contatos diferentes por 24 h em cada faixa da Meta (null = ilimitado). */
const LIMITES: Record<string, number | null> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_2K: 2000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: null,
}

/** Faixa a partir do que a Meta mandar: "TIER_2K" ou, em alguns avisos, o número (2000). */
export function faixaDoLimite(valor: unknown): string | null {
  if (typeof valor === 'string' && valor in LIMITES) return valor
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero <= 0) return null
  return Object.entries(LIMITES).find(([, limite]) => limite === numero)?.[0] ?? null
}

/** Limite usado no envio. Faixa desconhecida (ou TIER_NOT_SET) vale como a inicial (250), por segurança. */
export function limiteDiario(tier: string | null): number | null {
  return tier && tier in LIMITES ? LIMITES[tier] : 250
}

export function rotuloLimite(tier: string | null): string {
  if (!tier || !(tier in LIMITES)) return '—'
  const limite = LIMITES[tier]
  return limite === null ? 'Ilimitado' : `${limite.toLocaleString('pt-BR')} contatos/dia`
}

/** Qualidade do número na Meta (reações dos clientes nos últimos 7 dias). */
export const QUALIDADE: Record<string, { rotulo: string; tom: Tom }> = {
  GREEN: { rotulo: 'Alta', tom: 'sucesso' },
  YELLOW: { rotulo: 'Média', tom: 'alerta' },
  RED: { rotulo: 'Baixa', tom: 'perigo' },
  UNKNOWN: { rotulo: 'Em avaliação', tom: 'neutro' },
  NA: { rotulo: 'Em avaliação', tom: 'neutro' },
}
