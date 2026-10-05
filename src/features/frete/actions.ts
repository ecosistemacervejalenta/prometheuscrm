'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { dinheiro, formParaObjeto } from '@/lib/validacao'

import { MAX_FAIXAS } from './ceps'
import type { ResumoCeps } from './queries'

function atualizarTelas() {
  revalidatePath('/configuracoes', 'layout')
  revalidatePath('/grupo-vip')
}

const esquemaValor = z.object({ frete_vip_valor: dinheiro('Informe o valor do frete.') })

export async function salvarValorFreteVip(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaValor.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase.from('configuracoes').update(dados.data).eq('id', 1)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Valor do frete salvo.')
}

/**
 * Troca a lista inteira de CEPs VIP (planilha nova). Lista vazia = remover todos.
 * `lista` vem compacta, em texto: "01310100,0400000004999999,..." (8 dígitos = CEP avulso,
 * 16 = faixa início+fim). Um array com dezenas de milhares de pares estoura o limite de
 * aninhamento das Server Actions ("Maximum array nesting exceeded").
 */
export async function substituirCepsVip(
  lista: string,
  arquivo: string | null,
): Promise<{ ok: true; resumo: ResumoCeps } | { ok: false; mensagem: string }> {
  const { supabase } = await exigirEquipe()
  const tokens = lista ? lista.split(',') : []
  if (tokens.length > MAX_FAIXAS) return { ok: false, mensagem: 'Lista grande demais.' }

  const faixas: Array<[string, string]> = []
  for (const token of tokens) {
    if (!/^\d{8}(\d{8})?$/.test(token)) return { ok: false, mensagem: 'Lista de CEPs inválida.' }
    const inicio = token.slice(0, 8)
    const fim = token.length === 16 ? token.slice(8) : inicio
    if (inicio > fim) return { ok: false, mensagem: 'Lista de CEPs inválida.' }
    faixas.push([inicio, fim])
  }

  const { data, error } = await supabase.rpc('substituir_ceps_frete_vip', {
    p_faixas: faixas,
    p_arquivo: arquivo?.trim().slice(0, 200) || undefined,
  })
  if (error) return { ok: false, mensagem: traduzirErro(error) }
  atualizarTelas()
  return { ok: true, resumo: data as ResumoCeps }
}

/** Teste rápido em Configurações: o CEP tem frete fixo? */
export async function testarCepVip(valor: string): Promise<EstadoAcao & { vip?: boolean }> {
  const { supabase } = await exigirEquipe()
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length !== 8) return falha('Digite os 8 números do CEP.')
  const { data, error } = await supabase.rpc('cep_tem_frete_vip', { p_cep: digitos })
  if (error) return falha(traduzirErro(error))
  return { ok: true, vip: Boolean(data) }
}
