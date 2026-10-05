'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { gerarBoletos, gerarParcelas } from '@/features/financeiro/regras'
import { errosDeValidacao, falha, sucesso, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { hojeISO, mesAtual, primeiroDia } from '@/lib/datas'
import { agruparLista, formParaObjeto } from '@/lib/validacao'

import { esquemaContaFixa, esquemaContaVariavel, esquemaEdicaoConta, esquemaVariosBoletos } from './schema'

function atualizarTelas() {
  revalidatePath('/contas', 'layout')
  revalidatePath('/fornecedores', 'layout')
  revalidatePath('/')
}

/** À vista ou parcelada mês a mês (uma conta por parcela). */
function lerParcelamento(formulario: Record<string, unknown>) {
  const dados = esquemaContaVariavel.safeParse(formulario)
  if (!dados.success) return errosDeValidacao(dados.error)
  const { parcelas, modo_valor, vencimento, descricao, valor, ...resto } = dados.data
  return { resto, lancamentos: gerarParcelas({ descricao, valor, modo: modo_valor, parcelas, vencimento }) }
}

/** Vários boletos da mesma empresa (uma conta por boleto, em ordem de vencimento). */
function lerVariosBoletos(formulario: Record<string, unknown>) {
  const dados = esquemaVariosBoletos.safeParse(formulario)
  if (!dados.success) return errosDeValidacao(dados.error)
  const { boletos, descricao, ...resto } = dados.data
  return { resto, lancamentos: gerarBoletos({ descricao, boletos }) }
}

/** Lança uma conta variável — ou várias: parcelada (uma por mês) ou com vários boletos (uma por boleto). */
export async function criarContaVariavel(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const formulario = agruparLista(formParaObjeto(formData), 'boletos')
  const lido = formulario.boletos.length > 0 ? lerVariosBoletos(formulario) : lerParcelamento(formulario)
  if (!('lancamentos' in lido)) return lido

  const { resto, lancamentos } = lido
  const { ja_paga, ...comuns } = resto
  const linhas = lancamentos.map((lancamento, i) => ({
    ...comuns,
    ...lancamento,
    tipo: 'variavel' as const,
    ...(ja_paga && i === 0 ? { status: 'paga' as const, pago_em: hojeISO() } : { status: 'pendente' as const }),
  }))

  const { error } = await supabase.from('contas_pagar').insert(linhas)
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  redirect(`/contas?mes=${lancamentos[0].vencimento.slice(0, 7)}`)
}

/** Cria ou edita um modelo de conta fixa. */
export async function salvarContaFixa(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaContaFixa.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { atualizar_pendentes, ...modelo } = dados.data

  if (id) {
    // Pausar, encerrar ou adiar o início remove (no banco) os lançamentos pendentes que deixaram de valer.
    const { error } = await supabase.from('contas_fixas').update(modelo).eq('id', id)
    if (error) return falha(traduzirErro(error))

    if (atualizar_pendentes) {
      const aplicar = await supabase.rpc('aplicar_conta_fixa_aos_pendentes', { p_conta_fixa_id: id })
      if (aplicar.error) return falha(traduzirErro(aplicar.error))
    }
  } else {
    const { error } = await supabase.from('contas_fixas').insert(modelo)
    if (error) return falha(traduzirErro(error))
  }

  const gerar = await supabase.rpc('gerar_contas_fixas', { p_competencia: primeiroDia(mesAtual()) })
  if (gerar.error) return falha(traduzirErro(gerar.error))

  atualizarTelas()
  redirect('/contas/fixas')
}

export async function atualizarConta(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaEdicaoConta.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  // Variáveis vão para o mês do novo vencimento; fixas ficam no mês em que foram geradas.
  const { data, error } = await supabase
    .from('contas_pagar')
    .update({ ...dados.data, valor_pago: dados.data.status === 'paga' ? dados.data.valor : null })
    .eq('id', id)
    .select('competencia')
    .single()
  if (error) return falha(traduzirErro(error))

  atualizarTelas()
  redirect(`/contas?mes=${data.competencia.slice(0, 7)}`)
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
  if (ativa) {
    const gerar = await supabase.rpc('gerar_contas_fixas', { p_competencia: primeiroDia(mesAtual()) })
    if (gerar.error) return falha(traduzirErro(gerar.error))
  }
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
