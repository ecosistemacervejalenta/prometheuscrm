import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { ErroShopify } from '@/features/shopify/api'
import type { Database } from '@/types/database.types'

import { formatarPercentual } from './rotulos'
import { acessoComEscopo, atualizarDescontoDoCupom, buscarCupom, criarCupom, definirCupomAtivo, ESCOPO_CUPONS } from './shopify'

/**
 * Deixa o cupom da Shopify igual ao cadastro do influenciador e grava o resultado na linha dele
 * (cupom_situacao / cupom_detalhe). Roda só com a chave secreta, depois de a equipe ser conferida.
 *
 *   • Não existe na Shopify  → cria (influenciador ativo) com o percentual do cadastro.
 *   • Já existe e é a 1ª vez → LIGA ao influenciador como está: o CRM adota o percentual da
 *                              Shopify em vez de mexer num cupom que a loja já usava.
 *   • Já ligado              → acerta o percentual e liga/desliga conforme o status.
 *   • Sem conexão/permissão  → fica "pendente", com a instrução para criar à mão.
 * Nunca lança: a tela mostra a mensagem devolvida.
 */

type Banco = SupabaseClient<Database>

export type ResultadoDoCupom = { ok: boolean; mensagem: string }

export async function sincronizarCupomNaShopify(db: Banco, influenciadorId: string): Promise<ResultadoDoCupom> {
  const { data: i } = await db
    .from('influenciadores')
    .select('id, nome, cupom, desconto_percentual, status, shopify_desconto_id')
    .eq('id', influenciadorId)
    .maybeSingle()
  if (!i) return { ok: false, mensagem: 'Influenciador não encontrado.' }

  const gravar = async (campos: Database['public']['Tables']['influenciadores']['Update']) => {
    const { error } = await db.from('influenciadores').update({ ...campos, cupom_conferido_em: new Date().toISOString() }).eq('id', i.id)
    if (error) console.error('[influenciadores] gravar situação do cupom', error.message)
  }
  const deveEstarAtivo = i.status === 'ativo'
  const desconto = Number(i.desconto_percentual)

  try {
    const permissao = await acessoComEscopo(db, ESCOPO_CUPONS, { conferir: true })
    if (!permissao.ok) {
      const comoResolver =
        permissao.motivo === 'sem_conexao'
          ? `A Shopify não está conectada ao CRM. Crie o cupom ${i.cupom} (${formatarPercentual(desconto)}) em Descontos, no admin da Shopify — as vendas com ele são contadas do mesmo jeito.`
          : `O app da Shopify ainda não pode criar cupons. Crie o cupom ${i.cupom} (${formatarPercentual(desconto)}) em Descontos, no admin da Shopify, ou dê a permissão em Influenciadores › Ajustes.`
      await gravar({ cupom_situacao: 'pendente', cupom_detalhe: comoResolver })
      return { ok: false, mensagem: comoResolver }
    }
    const { acesso } = permissao

    const existente = await buscarCupom(acesso, i.cupom)
    if (!existente) {
      if (!deveEstarAtivo) {
        await gravar({ cupom_situacao: 'inativo', cupom_detalhe: 'O cupom ainda não existe na Shopify: ele é criado quando o influenciador for reativado.', shopify_desconto_id: null })
        return { ok: true, mensagem: 'O cupom ainda não existe na Shopify (será criado ao reativar).' }
      }
      const id = await criarCupom(acesso, { codigo: i.cupom, percentual: desconto, influenciador: i.nome })
      await gravar({ cupom_situacao: 'ativo', cupom_detalhe: null, shopify_desconto_id: id })
      return { ok: true, mensagem: `Cupom ${i.cupom} criado na Shopify com ${formatarPercentual(desconto)} de desconto.` }
    }

    const primeiraVez = i.shopify_desconto_id !== existente.id
    let detalhe: string | null = null
    let percentualFinal = desconto

    if (existente.percentual === null) {
      detalhe = 'Este cupom da Shopify não é de porcentagem (valor fixo, frete grátis ou outro tipo): o desconto do cliente é o que está configurado lá.'
    } else if (primeiraVez) {
      // Cupom que a loja já usava: o CRM passa a mostrar o desconto que está na Shopify.
      percentualFinal = existente.percentual
    } else if (Math.abs(existente.percentual - desconto) > 0.001) {
      await atualizarDescontoDoCupom(acesso, existente.id, desconto)
    }

    if (existente.ativo !== deveEstarAtivo) await definirCupomAtivo(acesso, existente.id, deveEstarAtivo)

    await gravar({
      cupom_situacao: deveEstarAtivo ? 'ativo' : 'inativo',
      cupom_detalhe: detalhe,
      shopify_desconto_id: existente.id,
      ...(percentualFinal !== desconto ? { desconto_percentual: percentualFinal } : {}),
    })

    if (primeiraVez && percentualFinal !== desconto) {
      return { ok: true, mensagem: `O cupom ${i.cupom} já existia na Shopify com ${formatarPercentual(percentualFinal)}: foi ligado ao influenciador como está.` }
    }
    if (primeiraVez) return { ok: true, mensagem: `O cupom ${i.cupom} já existia na Shopify e foi ligado ao influenciador.` }
    return { ok: true, mensagem: deveEstarAtivo ? `Cupom ${i.cupom} conferido: ativo na Shopify.` : `Cupom ${i.cupom} desligado na Shopify.` }
  } catch (e) {
    if (!(e instanceof ErroShopify)) console.error('[influenciadores] cupom na Shopify', e)
    const mensagem = e instanceof ErroShopify ? e.message : 'Não foi possível falar com a Shopify. Tente de novo em instantes.'
    // Sem permissão vira "pendente" (falta fazer algo); o resto é erro de verdade.
    await gravar({ cupom_situacao: e instanceof ErroShopify && e.tipo === 'permissao' ? 'pendente' : 'erro', cupom_detalhe: mensagem })
    return { ok: false, mensagem }
  }
}
