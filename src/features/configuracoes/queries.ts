import 'server-only'

import { cache } from 'react'

import { exigirEquipe } from '@/lib/auth'
import type { Configuracoes } from '@/types'

const PADRAO: Configuracoes = {
  id: 1,
  nome_loja: 'Prometheus',
  whatsapp_loja: null,
  chave_pix: null,
  nome_recebedor_pix: null,
  mensagem_pre_venda: '🍺 *{titulo}*\n\n{descricao}\n\nGaranta a sua pelo link 👇\n{link}',
  mensagem_cobranca: 'Olá, {nome}! Segue o pedido *#{pedido}*:\n{itens}\n\n*Total: {total}*\n\n{pagamento}',
  atualizado_em: new Date(0).toISOString(),
  whatsapp_assinatura: true,
  whatsapp_nomes_assinatura: [],
  whatsapp_leads_automatico: true,
  whatsapp_pasta_leads_id: null,
  whatsapp_rodizio: false,
  whatsapp_rodizio_participantes: [],
  whatsapp_rodizio_ultimo_id: null,
  whatsapp_comprovante: null,
  frete_vip_valor: 15,
  frete_vip_arquivo: null,
  frete_vip_importado_em: null,
  caixa_prazo_pagamento_dias: 7,
  lotes_aviso_grupo: true,
  influ_comissao_padrao: 10,
  influ_desconto_padrao: 10,
  influ_carencia_dias: 7,
  influ_regras: null,
  influ_loja_url: null,
  influ_nome_loja: null,
  influ_sincronizado_ate: null,
  influ_sincronizado_em: null,
  influ_sincronizacao_erro: null,
  compras_sincronizado_ate: null,
  compras_sincronizado_em: null,
  compras_sincronizacao_erro: null,
  compras_historico_completo: false,
  colecoes_lidas_em: null,
}

/** Configurações da loja (linha única). */
export const obterConfiguracoes = cache(async (): Promise<Configuracoes> => {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('configuracoes').select('*').eq('id', 1).maybeSingle()
  return data ?? PADRAO
})

export async function listarEquipe() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('perfis').select('*').order('ativo', { ascending: false }).order('nome')
  return data ?? []
}

export async function listarWebhooks() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('webhooks').select('*').order('criado_em')
  return data ?? []
}

export async function listarEventosRecentes() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('eventos_integracao')
    .select('id, tipo, status, tentativas, ultimo_erro, criado_em, processado_em')
    .order('criado_em', { ascending: false })
    .limit(15)
  return data ?? []
}
