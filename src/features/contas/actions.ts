'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { hojeISO, mesAtual, primeiroDia, somarMesesData } from '@/lib/datas'
import { formParaObjeto } from '@/lib/validacao'

import { esquemaContaFixa, esquemaContaVariavel, esquemaEdicaoConta } from './schema'

function atualizarTelas() {
  revalidatePath('/contas', 'layout')
  revalidatePath('/')
}

/** Lança uma conta variável — ou várias, se parcelada (uma por mês). */
export async function criarContaVariavel(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaContaVariavel.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { parcelas, ja_paga, vencimento, descricao, ...resto } = dados.data
  const linhas = Array.from({ length: parcelas }, (_, i) => {
    const venc = somarMesesData(vencimento, i)
    return {
      ...resto,
      tipo: 'variavel' as const,
      descricao: parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao,
      vencimento: venc,
      competencia: `${venc.slice(0, 7)}-01`,
      status: ja_paga && i === 0 ? ('paga' as const) : ('pendente' as const),
    }
  })

  const { error } = await supabase.from('contas_pagar').insert(linhas)
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  redirect(`/contas?mes=${vencimento.slice(0, 7)}`)
}

/** Cria ou edita um modelo de conta fixa. */
export async function salvarContaFixa(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaContaFixa.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { atualizar_pendentes, ...modelo } = dados.data

  if (id) {
    const { error } = await supabase.from('contas_fixas').update(modelo).eq('id', id)
    if (error) return falha(traduzirErro(error))

    if (atualizar_pendentes) {
      const { error: erroPendentes } = await supabase
        .from('contas_pagar')
        .update({
          descricao: modelo.descricao,
          categoria: modelo.categoria,
          fornecedor_id: modelo.fornecedor_id,
          valor: modelo.valor,
        })
        .eq('conta_fixa_id', id)
        .eq('status', 'pendente')
        .gte('competencia', primeiroDia(mesAtual()))
      if (erroPendentes) return falha(traduzirErro(erroPendentes))
    }
  } else {
    const { error } = await supabase.from('contas_fixas').insert(modelo)
    if (error) return falha(traduzirErro(error))
    await supabase.rpc('gerar_contas_fixas', { p_competencia: primeiroDia(mesAtual()) })
  }

  atualizarTelas()
  redirect('/contas/fixas')
}

export async function atualizarConta(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaEdicaoConta.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { error } = await supabase
    .from('contas_pagar')
    .update({ ...dados.data, valor_pago: dados.data.status === 'paga' ? dados.data.valor : null })
    .eq('id', id)
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  redirect(`/contas?mes=${dados.data.vencimento.slice(0, 7)}`)
}

export async function pagarConta(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('contas_pagar').update({ status: 'paga', pago_em: hojeISO() }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Conta marcada como paga.')
}

export async function reabrirConta(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('contas_pagar').update({ status: 'pendente' }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Conta reaberta.')
}

/** Fixas são canceladas (para não serem geradas de novo); variáveis são excluídas. */
export async function removerConta(id: string, tipo: 'fixa' | 'variavel'): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } =
    tipo === 'fixa'
      ? await supabase.from('contas_pagar').update({ status: 'cancelada' }).eq('id', id)
      : await supabase.from('contas_pagar').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso(tipo === 'fixa' ? 'Conta cancelada neste mês.' : 'Conta excluída.')
}

export async function alternarContaFixa(id: string, ativa: boolean): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('contas_fixas').update({ ativa }).eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso(ativa ? 'Conta fixa reativada.' : 'Conta fixa pausada: não será gerada nos próximos meses.')
}

export async function excluirContaFixa(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('contas_fixas').delete().eq('id', id)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  redirect('/contas/fixas')
}
