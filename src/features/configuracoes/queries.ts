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
