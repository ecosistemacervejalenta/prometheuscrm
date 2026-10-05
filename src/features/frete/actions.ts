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

const cep = z.string().regex(/^\d{8}$/)
const esquemaLista = z.object({
  faixas: z.array(z.tuple([cep, cep]).refine(([inicio, fim]) => inicio <= fim)).max(MAX_FAIXAS, 'Lista grande demais.'),
  arquivo: z.string().trim().max(200).nullable(),
})

/** Troca a lista inteira de CEPs VIP (planilha nova). Lista vazia = remover todos. */
export async function substituirCepsVip(
  faixas: Array<[string, string]>,
  arquivo: string | null,
): Promise<{ ok: true; resumo: ResumoCeps } | { ok: false; mensagem: string }> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaLista.safeParse({ faixas, arquivo })
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? 'Lista de CEPs inválida.' }

  const { data, error } = await supabase.rpc('substituir_ceps_frete_vip', {
    p_faixas: dados.data.faixas,
    p_arquivo: dados.data.arquivo ?? undefined,
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
