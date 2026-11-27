'use server'

import { revalidatePath } from 'next/cache'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlDaRequisicao } from '@/lib/url'
import { formParaObjeto } from '@/lib/validacao'

import { alertaDeTeste, registrarEEntregar } from './alertas-mercado-livre'
import { MARKETPLACES, type IdMarketplace } from './canais'
import { pedirARotinaMarketplaces } from './disparo'
import { esquemaCredenciais } from './schema'

function atualizarTela() {
  revalidatePath('/configuracoes', 'layout')
}

export async function salvarCredenciaisMarketplace(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const dados = esquemaCredenciais.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.rpc('salvar_credenciais_marketplace', {
    p_canal: dados.data.canal,
    p_client_id: dados.data.client_id,
    p_segredo: dados.data.segredo ?? '',
  })
  if (error) return falha(traduzirErro(error))
  atualizarTela()
  return sucesso(`Dados do app salvos. Agora clique em “Conectar ${MARKETPLACES[dados.data.canal].nome}”.`)
}

export async function testarConexaoMarketplace(canal: IdMarketplace): Promise<EstadoAcao> {
  await exigirEquipe()
  const resposta = await pedirARotinaMarketplaces(await urlDaRequisicao(), { acao: 'verificar', canal })
  atualizarTela()
  return resposta.ok ? sucesso(resposta.mensagem) : falha(resposta.mensagem)
}

/** Manda ao grupo da equipe (pelo n8n) um alerta de exemplo marcado como TESTE. */
export async function testarAlertaMercadoLivre(): Promise<EstadoAcao> {
  const { perfil } = await exigirEquipe()
  let entrega
  try {
    entrega = await registrarEEntregar(createAdminClient(), alertaDeTeste(), perfil.id)
  } catch (erro) {
    return falha(erro instanceof Error ? traduzirErro(erro) : 'Não foi possível pôr o alerta na fila.')
  }
  atualizarTela()
  if (entrega?.status === 'enviado') return sucesso('Alerta de teste entregue ao n8n. Deve aparecer no grupo em instantes.')
  if (entrega?.status === 'sem_destino') {
    return falha('Nenhum webhook ativo recebe os alertas do Mercado Livre. Confira em Configurações › Webhooks o "n8n · alertas do Mercado Livre".')
  }
  return falha(
    `O n8n não recebeu (${entrega?.erro ?? 'sem resposta'}). Confira se o fluxo "Cerveja Lenta - Aviso de Venda (grupo equipe)" está publicado. ` +
      'O CRM tenta de novo sozinho daqui a pouco.',
  )
}

export async function desconectarMarketplace(canal: IdMarketplace): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('desconectar_marketplace', { p_canal: canal })
  if (error) return falha(traduzirErro(error))
  atualizarTela()
  return sucesso(`${MARKETPLACES[canal].nome} desconectado. O ID e a chave do app continuam salvos para reconectar.`)
}
