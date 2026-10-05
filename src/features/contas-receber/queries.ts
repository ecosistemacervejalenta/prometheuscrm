import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import { intervaloDoMes, primeiroDia } from '@/lib/datas'

export async function contasReceberDoMes(mes: string) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('vw_contas_receber')
    .select('*')
    .eq('competencia', primeiroDia(mes))
    .order('vencimento')
    .order('descricao')
  if (error) throw error
  return data
}

/** Contas ainda pendentes de meses anteriores a `mes` (todas já atrasadas). */
export async function contasReceberAtrasadasAntesDe(mes: string) {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('vw_contas_receber')
    .select('*')
    .eq('status', 'pendente')
    .lt('competencia', primeiroDia(mes))
    .order('vencimento')
  if (error) throw error
  return data
}

export function resumirContasReceber(
  contas: Array<{ valor: number | null; status: string | null; situacao: string | null; valor_recebido: number | null }>,
) {
  const validas = contas.filter((c) => c.status !== 'cancelada')
  const soma = (lista: typeof validas, campo: 'valor' | 'valor_recebido' = 'valor') =>
    lista.reduce((total, c) => total + Number(c[campo] ?? 0), 0)
  const atrasadas = validas.filter((c) => c.situacao === 'vencida')
  return {
    total: soma(validas),
    recebido: soma(validas.filter((c) => c.status === 'recebida'), 'valor_recebido'),
    aReceber: soma(validas.filter((c) => c.status === 'pendente')),
    atrasado: soma(atrasadas),
    qtdAtrasadas: atrasadas.length,
  }
}

/** Total e quantidade de contas a receber atrasadas de todos os meses (painel). */
export async function resumoContasReceberAtrasadas() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('vw_contas_receber').select('valor').eq('situacao', 'vencida')
  if (error) throw error
  return { quantidade: data.length, total: data.reduce((s, c) => s + Number(c.valor ?? 0), 0) }
}

export async function obterContaReceber(id: string) {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.from('contas_receber').select('*').eq('id', id).maybeSingle()
  return data
}

/** Pagadores já usados (sugestões do campo "Recebido de"). */
export async function pagadoresRecentes() {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase
    .from('contas_receber')
    .select('pagador')
    .not('pagador', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(300)
  return [...new Set((data ?? []).map((c) => c.pagador as string))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Pedidos feitos no mês que ainda não foram pagos (pendentes ou cobrados). */
export async function pedidosEmAbertoDoMes(mes: string) {
  const { supabase } = await exigirEquipe()
  const { inicio, fim } = intervaloDoMes(mes)
  const { data, error } = await supabase
    .from('vw_pedidos')
    .select('id, numero, cliente_nome, total, status_pagamento, criado_em')
    .neq('status', 'cancelado')
    .in('status_pagamento', ['pendente', 'cobrado'])
    .gte('criado_em', inicio)
    .lt('criado_em', fim)
    .order('criado_em')
  if (error) throw error
  return { pedidos: data, total: data.reduce((s, p) => s + Number(p.total ?? 0), 0) }
}
