'use server'

import { revalidatePath } from 'next/cache'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { urlDaRequisicao } from '@/lib/url'
import { formParaObjeto } from '@/lib/validacao'

import { MARKETPLACES, type IdMarketplace } from './canais'
import { pedirARotinaMarketplaces } from './disparo'
import { esquemaCredenciais } from './schema'

function atualizarTela() {
  revalidatePath('/configuracoes/marketplaces')
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

export async function desconectarMarketplace(canal: IdMarketplace): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('desconectar_marketplace', { p_canal: canal })
  if (error) return falha(traduzirErro(error))
  atualizarTela()
  return sucesso(`${MARKETPLACES[canal].nome} desconectado. O ID e a chave do app continuam salvos para reconectar.`)
}
