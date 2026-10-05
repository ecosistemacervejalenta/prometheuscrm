import type { CanalVenda } from '@/types'

/**
 * Canais do painel "Vendas por canal".
 * As cores identificam o canal nos cartões e na barra de participação
 * (paleta validada para daltonismo e contraste sobre fundo branco).
 */

export type IdCanal = 'mercado_livre' | 'shopee' | 'shopify' | 'grupo_vip'

/** De onde vêm os números: ERP (via API) ou os pedidos do próprio CRM. */
export type OrigemDados = { tipo: 'erp' } | { tipo: 'crm'; canal: CanalVenda }

export type Canal = {
  id: IdCanal
  nome: string
  /** Texto curto exibido junto ao logotipo (ex.: Shopify = "Loja Virtual"). */
  detalhe?: string
  cor: string
  origem: OrigemDados
  /** `escala` compensa diferenças óticas entre logotipos (ex.: texto em duas linhas). */
  logo?: { src: string; alt: string; largura: number; altura: number; escala: number }
}

export const CANAIS: Canal[] = [
  {
    id: 'mercado_livre',
    nome: 'Mercado Livre',
    cor: '#3483FA',
    origem: { tipo: 'erp' },
    logo: { src: '/canais/mercado-livre.png', alt: 'Mercado Livre', largura: 475, altura: 122, escala: 1.4 },
  },
  {
    id: 'shopee',
    nome: 'Shopee',
    cor: '#EE4D2D',
    origem: { tipo: 'erp' },
    logo: { src: '/canais/shopee.png', alt: 'Shopee', largura: 343, altura: 109, escala: 1.2 },
  },
  {
    id: 'shopify',
    nome: 'Loja Virtual',
    detalhe: 'Loja Virtual',
    cor: '#008060',
    origem: { tipo: 'erp' },
    logo: { src: '/canais/shopify.png', alt: 'Shopify', largura: 960, altura: 275, escala: 1 },
  },
  {
    id: 'grupo_vip',
    nome: 'Grupo VIP',
    cor: '#C08A00',
    origem: { tipo: 'crm', canal: 'grupo_vip' },
  },
]
