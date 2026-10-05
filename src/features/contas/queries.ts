import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { primeiroDia } from '@/lib/datas'

/**
 * Contas de um mês. Antes de listar, garante que as contas fixas do mês
 * foram geradas (a função é idempotente — não duplica).
 */
export async function contasDoMes(mes: string) {
  const { supabase } = await exigirEquipe()
  const gerar = await supabase.rpc('gerar_contas_fixas', { p_competencia: primeiroDia(mes) })
  if (gerar.error) throw gerar.error

  const { data, error } = await supabase
    .from('vw_contas_pagar')
    .select('*')
    .eq('competencia', primeiroDia(mes))
    .order('vencimento')
    .order('descricao')
  if (error) throw error
  return data
}

/** Contas ainda pendentes de meses anteriores a `mes` (todas já vencidas). */
export async function contasAtrasadasAntesDe(mes: string) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('vw_contas_pagar')
    .select('*')
    .eq('status', 'pendente')
    .lt('competencia', primeiroDia(mes))
    .order('vencimento')
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

/** Total e quantidade de contas vencidas de todos os meses (painel "Precisa de atenção"). */
export async function resumoContasVencidas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('vw_contas_pagar').select('valor').eq('situacao', 'vencida')
  if (error) throw error
  return { quantidade: data.length, total: data.reduce((s, c) => s + Number(c.valor ?? 0), 0) }
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

/** Contas de um fornecedor: pendentes, total pago nos últimos 12 meses e lançamentos recentes. */
export async function contasDoFornecedor(fornecedorId: string, hoje: string) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('vw_contas_pagar')
    .select('*')
    .eq('fornecedor_id', fornecedorId)
    .neq('status', 'cancelada')
    .order('vencimento', { ascending: false })
  if (error) throw error

  const umAnoAtras = `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4)}`
  const pendentes = data.filter((c) => c.status === 'pendente')
  return {
    emAberto: pendentes.reduce((s, c) => s + Number(c.valor ?? 0), 0),
    qtdEmAberto: pendentes.length,
    qtdVencidas: pendentes.filter((c) => c.situacao === 'vencida').length,
    pagoUltimos12Meses: data
      .filter((c) => c.status === 'paga' && (c.pago_em ?? '') > umAnoAtras)
      .reduce((s, c) => s + Number(c.valor_pago ?? 0), 0),
    recentes: data.slice(0, 12),
    total: data.length,
  }
}
