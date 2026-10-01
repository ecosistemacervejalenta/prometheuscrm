import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { primeiroDia } from '@/lib/datas'

/**
 * Contas de um mês. Antes de listar, garante que as contas fixas do mês
 * foram geradas (a função é idempotente — não duplica).
 */
export async function contasDoMes(mes: string) {
  const { supabase } = await exigirEquipe()
  await supabase.rpc('gerar_contas_fixas', { p_competencia: primeiroDia(mes) })

  const { data, error } = await supabase
    .from('vw_contas_pagar')
    .select('*')
    .eq('competencia', primeiroDia(mes))
    .order('vencimento')
    .order('descricao')
  if (error) throw error
  return data
}

export function resumirContas(contas: Array<{ valor: number | null; status: string | null; situacao: string | null; valor_pago: number | null }>) {
  const validas = contas.filter((c) => c.status !== 'cancelada')
  const soma = (lista: typeof validas, campo: 'valor' | 'valor_pago' = 'valor') =>
    lista.reduce((total, c) => total + Number(c[campo] ?? 0), 0)
  return {
    total: soma(validas),
    pago: soma(validas.filter((c) => c.status === 'paga'), 'valor_pago'),
    aPagar: soma(validas.filter((c) => c.status === 'pendente')),
    vencido: soma(validas.filter((c) => c.situacao === 'vencida')),
    qtdVencidas: validas.filter((c) => c.situacao === 'vencida').length,
  }
}

export async function obterConta(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('contas_pagar').select('*').eq('id', id).maybeSingle()
  return data
}

export async function listarContasFixas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('contas_fixas')
    .select('*, fornecedores(nome)')
    .order('ativa', { ascending: false })
    .order('dia_vencimento')
  if (error) throw error
  return data
}

export async function obterContaFixa(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('contas_fixas').select('*').eq('id', id).maybeSingle()
  return data
}

/** Contas vencidas ou vencendo nos próximos dias (painel "Precisa de atenção"). */
export async function contasUrgentes() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('vw_contas_pagar')
    .select('id, descricao, valor, vencimento, situacao')
    .in('situacao', ['vencida', 'vence_logo'])
    .order('vencimento')
    .limit(10)
  return data ?? []
}
