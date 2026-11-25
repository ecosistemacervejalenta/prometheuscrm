'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { buscarCep } from '@/lib/cep'
import { formatarMoeda } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { formParaObjeto } from '@/lib/validacao'

import { consultarLoja, ErroShopify, ESCOPO_NECESSARIO, pedirToken } from './api'
import { fraseDaFalha, normalizarLoja, pesoDaCaixaKg, VALOR_PADRAO_POR_CERVEJA, type OpcaoDeFrete } from './cotacao'
import { calcularFreteNaLoja, garantirFreteDoPedido } from './frete'

/**
 * Conexão do CRM com a loja da Shopify para calcular o frete (Olist Envios) dos pedidos do link
 * com CEP fora da lista VIP. As credenciais são conferidas na Shopify antes de irem para o Vault.
 */

const semEspacos = (rotulo: string, max: number) =>
  z
    .string({ error: `Cole o ${rotulo} do app.` })
    .trim()
    .min(8, `Cole o ${rotulo} do app.`)
    .max(max, `${rotulo} grande demais — confira o que foi copiado.`)
    .regex(/^\S+$/, `O ${rotulo} não tem espaços — confira o que foi copiado.`)

const esquemaConexao = z.object({
  loja: z.string({ error: 'Informe o endereço da loja.' }).trim().min(1, 'Informe o endereço da loja.').max(200),
  client_id: semEspacos('Client ID', 120),
  client_secret: semEspacos('Client secret', 200),
})

function atualizarTelas() {
  revalidatePath('/configuracoes', 'layout')
  revalidatePath('/p/[slug]', 'page')
}

export async function salvarConexaoShopify(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const dados = esquemaConexao.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const loja = normalizarLoja(dados.data.loja)
  if (!loja) {
    return {
      ok: false,
      mensagem: 'Revise os campos destacados.',
      erros: { loja: ['Use o endereço .myshopify.com da loja (ex.: minhaloja.myshopify.com), não o domínio do site.'] },
    }
  }

  // O app é conferido na Shopify antes de qualquer coisa ir para o Vault.
  let token: Awaited<ReturnType<typeof pedirToken>>
  let nomeDaLoja: string
  try {
    token = await pedirToken(loja, dados.data.client_id, dados.data.client_secret)
    const escopos = token.escopos.split(',').map((e) => e.trim())
    if (!escopos.includes(ESCOPO_NECESSARIO)) {
      return falha(
        `A Shopify aceitou o app, mas ele está sem a permissão de rascunhos de pedido (${ESCOPO_NECESSARIO}). No Dev Dashboard, crie uma versão do app com esse escopo, clique em Release e aprove o novo acesso na loja. Depois conecte de novo.`,
      )
    }
    nomeDaLoja = (await consultarLoja({ loja, token: token.token })).nome
  } catch (e) {
    if (!(e instanceof ErroShopify)) console.error('[shopify] conectar', e)
    return falha(e instanceof ErroShopify ? e.message : 'Não foi possível conferir o app na Shopify. Tente de novo em instantes.')
  }

  const { error } = await supabase.rpc('salvar_conexao_shopify', {
    p_loja: loja,
    p_loja_nome: nomeDaLoja,
    p_client_id: dados.data.client_id,
    p_client_secret: dados.data.client_secret,
    p_escopos: token.escopos,
    p_token: token.token,
    p_token_expira_em: token.expiraEm,
  })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso(`Shopify conectada: ${nomeDaLoja}. No link, CEP fora da lista VIP já tem o frete calculado sozinho.`)
}

export async function desconectarShopify(): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const { error } = await supabase.rpc('desconectar_shopify')
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Shopify desconectada. CEP fora da lista VIP volta a ser “frete a cotar” pela equipe.')
}

export type TesteDeFrete =
  | {
      ok: true
      cep: string
      cidade: string
      uf: string
      unidades: number
      pesoKg: number
      /** O CEP está na lista VIP: no link ele paga o frete fixo, não este cálculo. */
      vip: boolean
      freteVip: number
      opcoes: OpcaoDeFrete[]
    }
  | { ok: false; mensagem: string }

/** "Testar um frete" da tela de Configurações: mesma conta do link, sem pedido nenhum. */
export async function testarFrete(cep: string, unidades: number): Promise<TesteDeFrete> {
  await exigirEquipe()
  const digitos = String(cep ?? '').replace(/\D/g, '')
  const quantidade = Math.floor(Number(unidades))
  if (digitos.length !== 8) return { ok: false, mensagem: 'Informe um CEP com 8 números.' }
  if (!Number.isFinite(quantidade) || quantidade < 1 || quantidade > 200) return { ok: false, mensagem: 'Informe de 1 a 200 cervejas.' }

  const endereco = await buscarCep(digitos)
  if (!endereco?.cidade || !endereco.uf) return { ok: false, mensagem: 'Não achei este CEP. Confira os números.' }

  // Chave secreta só para ler as credenciais da Shopify (Vault): a sessão da equipe já foi conferida acima.
  const db = createAdminClient()
  const [{ data: vip }, { data: config }, resultado] = await Promise.all([
    db.rpc('cep_tem_frete_vip', { p_cep: digitos }),
    db.from('configuracoes').select('frete_vip_valor').eq('id', 1).maybeSingle(),
    calcularFreteNaLoja(db, { unidades: quantidade, cep: digitos, valor: quantidade * VALOR_PADRAO_POR_CERVEJA, endereco }),
  ])
  if (!resultado.ok) return { ok: false, mensagem: fraseDaFalha(resultado.detalhe) }

  await db.from('integracao_shopify').update({ cotacao_em: new Date().toISOString(), ultimo_erro: null }).eq('id', 1)
  revalidatePath('/configuracoes', 'layout')
  return {
    ok: true,
    cep: digitos,
    cidade: endereco.cidade,
    uf: endereco.uf,
    unidades: quantidade,
    pesoKg: pesoDaCaixaKg(quantidade),
    vip: Boolean(vip),
    freteVip: Number(config?.frete_vip_valor ?? 0),
    opcoes: resultado.opcoes,
  }
}

const SEM_CALCULO: Record<string, string> = {
  sem_conexao: 'A Shopify não está conectada. Conecte em Configurações › Shopify.',
  pedido_nao_encontrado: 'Pedido não encontrado.',
  pedido_fechado: 'Este pedido já foi pago, separado ou cancelado: o frete não é mais calculado.',
  frete_fixo: 'Este pedido tem frete fixo (CEP da lista VIP).',
  frete_manual: 'O frete deste pedido foi informado à mão e não é trocado pelo cálculo.',
  em_dia: 'O frete já está calculado para as cervejas e o CEP desta caixa.',
  sem_itens: 'O pedido está sem itens.',
  sem_cep: 'O endereço de entrega está sem CEP.',
}

/** Botão "Calcular pelo Olist Envios" do pedido (equipe). */
export async function calcularFreteDoPedido(id: string): Promise<EstadoAcao> {
  await exigirEquipe()
  if (!z.uuid().safeParse(id).success) return falha('Pedido inválido.')

  // Chave secreta só para o cálculo: as credenciais da Shopify ficam no Vault e as funções do frete são do servidor.
  const r = await garantirFreteDoPedido(createAdminClient(), id, { forcar: true })
  revalidatePath(`/pedidos/${id}`)
  revalidatePath('/pedidos')
  revalidatePath('/grupo-vip')

  if (r.situacao === 'calculado') return sucesso(`Frete calculado: ${formatarMoeda(r.valor)} · ${r.servico}. Envie o valor ao cliente pelo WhatsApp.`)
  if (r.situacao === 'nao_calculado') return falha(`${fraseDaFalha(r.detalhe)} Informe o valor à mão.`)
  return falha(SEM_CALCULO[r.motivo] ?? 'Este pedido não precisa de cálculo de frete.')
}
