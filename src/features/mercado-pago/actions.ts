'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import { urlDaRequisicao } from '@/lib/url'
import { formParaObjeto } from '@/lib/validacao'

import { consultarConta } from './api'

const opcional = (max: number, mensagem: string) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max, mensagem).nullable())

const esquemaConexao = z.object({
  // Vazio mantém o token já salvo (para só trocar a assinatura do webhook).
  token: opcional(300, 'Token grande demais — confira o que foi copiado.').refine(
    (v) => v === null || /^APP_USR-[\w-]+$/.test(v),
    'Use o Access Token de PRODUÇÃO (começa com APP_USR-). O de teste (TEST-) não recebe PIX de verdade.',
  ),
  segredo_webhook: opcional(200, 'Assinatura grande demais — confira o que foi copiado.'),
})

function atualizarTela() {
  revalidatePath('/configuracoes/mercado-pago')
}

export async function salvarConexaoMercadoPago(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const dados = esquemaConexao.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { token, segredo_webhook } = dados.data

  // O token novo é conferido no Mercado Pago antes de ir para o Vault.
  let conta: Awaited<ReturnType<typeof consultarConta>> | null = null
  if (token) {
    try {
      conta = await consultarConta(token)
    } catch (e) {
      return falha(e instanceof Error ? e.message : 'Não foi possível conferir o token no Mercado Pago.')
    }
  }

  const { error } = await supabase.rpc('salvar_conexao_mercado_pago', {
    p_token: token ?? '',
    p_conta: conta ? { id: conta.id, nome: conta.nome, email: conta.email } : {},
    p_segredo_webhook: segredo_webhook ?? '',
  })
  if (error) return falha(traduzirErro(error))
  atualizarTela()
  revalidatePath('/p/[slug]', 'page')
  return sucesso(conta ? `Mercado Pago conectado: conta ${conta.nome ?? conta.id}. O link da pré-venda já mostra o PIX automático.` : 'Dados salvos.')
}

export async function testarConexaoMercadoPago(): Promise<EstadoAcao> {
  await exigirEquipe()
  if (!envServidor.cronSecret) return falha('Configure CRON_SECRET na Vercel para testar a conexão.')
  try {
    const resposta = await fetch(`${await urlDaRequisicao()}/api/cron/mercado-pago`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${envServidor.cronSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'verificar' }),
      cache: 'no-store',
    })
    const corpo = (await resposta.json().catch(() => null)) as { ok?: boolean; mensagem?: string } | null
    atualizarTela()
    if (!corpo?.ok) return falha(corpo?.mensagem ?? `A rotina recusou o pedido (HTTP ${resposta.status}).`)
    return sucesso(corpo.mensagem)
  } catch (e) {
    console.error('[mercado-pago] testar conexão', e)
    return falha('Não foi possível falar com a rotina do Mercado Pago. Tente de novo em instantes.')
  }
}

export async function desconectarMercadoPago(): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('desconectar_mercado_pago')
  if (error) return falha(traduzirErro(error))
  atualizarTela()
  revalidatePath('/p/[slug]', 'page')
  return sucesso('Mercado Pago desconectado. O link volta a mostrar a chave PIX e o envio do comprovante.')
}
