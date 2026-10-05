'use server'

import { revalidatePath } from 'next/cache'

import { falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import { urlDoSite } from '@/lib/url'

import { dispararSincronizacao } from './disparo'

function atualizarTelas() {
  revalidatePath('/')
  revalidatePath('/configuracoes/integracoes')
}

export async function sincronizarOlistAgora(): Promise<EstadoAcao> {
  await exigirEquipe()
  if (!envServidor.cronSecret) return falha('Configure CRON_SECRET na Vercel para sincronizar com o Olist.')

  const resultado = await dispararSincronizacao(await urlDoSite(), 'rapida')
  atualizarTelas()
  if (!resultado) return falha('Não foi possível iniciar a sincronização. Tente de novo em instantes.')
  if (resultado.ok) {
    return sucesso(
      resultado.completa
        ? `Histórico importado do Olist: ${resultado.pedidos} pedido(s).`
        : `Olist atualizado: ${resultado.pedidos} pedido(s) conferidos.`,
    )
  }
  if (resultado.codigo === 'em_andamento') return sucesso('Uma sincronização já está em andamento. Atualize a página em instantes.')
  return falha(resultado.motivo)
}

export async function desconectarOlist(): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('desconectar_olist')
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Olist desconectado. Os pedidos já sincronizados continuam no histórico.')
}
