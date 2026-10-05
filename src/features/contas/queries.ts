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

export type DividaFornecedor = {
  /** id do fornecedor, ou "sem" para contas sem fornecedor. */
  id: string
  nome: string
  valor: number
  contas: number
  vencido: number
  proximoVencimento: string | null
}

const PAGINA_DIVIDAS = 1000

/**
 * Quanto falta pagar a cada fornecedor (contas pendentes), do maior para o menor:
 * `total` = tudo em aberto (vencidas + parcelas futuras já lançadas); `mes` = só o mês.
 * Chame depois de `contasDoMes(mes)`, que gera as contas fixas do mês.
 */
export async function dividasPorFornecedor(mes: string) {
  const { supabase } = await exigirEquipe()
  const linhas: Array<{ fornecedor_id: string | null; fornecedor_nome: string | null; valor: number | null; vencimento: string | null; competencia: string | null; situacao: string | null }> = []
  for (let de = 0; ; de += PAGINA_DIVIDAS) {
    const { data, error } = await supabase
      .from('vw_contas_pagar')
      .select('fornecedor_id, fornecedor_nome, valor, vencimento, competencia, situacao')
      .eq('status', 'pendente')
      .order('id')
      .range(de, de + PAGINA_DIVIDAS - 1)
    if (error) throw error
    linhas.push(...data)
    if (data.length < PAGINA_DIVIDAS) break
  }

  const agrupar = (lista: typeof linhas): DividaFornecedor[] => {
    const porFornecedor = new Map<string, DividaFornecedor>()
    for (const c of lista) {
      const id = c.fornecedor_id ?? 'sem'
      const item = porFornecedor.get(id) ?? { id, nome: c.fornecedor_nome ?? 'Sem fornecedor', valor: 0, contas: 0, vencido: 0, proximoVencimento: null }
      const valor = Number(c.valor ?? 0)
      item.valor = Math.round((item.valor + valor) * 100) / 100
      item.contas++
      if (c.situacao === 'vencida') item.vencido = Math.round((item.vencido + valor) * 100) / 100
      else if (c.vencimento && (!item.proximoVencimento || c.vencimento < item.proximoVencimento)) item.proximoVencimento = c.vencimento
      porFornecedor.set(id, item)
    }
    return [...porFornecedor.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  return { total: agrupar(linhas), mes: agrupar(linhas.filter((c) => c.competencia === primeiroDia(mes))) }
}
