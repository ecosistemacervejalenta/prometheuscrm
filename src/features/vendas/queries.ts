import 'server-only'

import { statusOlist, type StatusOlist } from '@/features/olist/queries'
import { exigirEquipe } from '@/lib/auth'
import { hojeISO, inicioDoDia, somarDias } from '@/lib/datas'
import type { CanalVenda } from '@/types'

import { CANAIS, type Canal, type IdCanal } from './canais'
import { vendasDoErp, type Vendas } from './erp'
import { intervalosDoPeriodo, type ChavePeriodo, type Intervalo } from './periodos'

export type EstadoCanal = 'ok' | 'aguardando' | 'erro'

export type ResumoCanal = Canal & {
  estado: EstadoCanal
  atual: Vendas | null
  anterior: Vendas | null
  ticket: number | null
  /** Variação do valor vendido vs. o período anterior (0,12 = +12%). null sem base de comparação. */
  variacao: number | null
  /** Fatia do total vendido (0 a 1), entre os canais com dados. */
  participacao: number
}

const ZERO: Vendas = { valor: 0, pedidos: 0 }
const PAGINA = 1000

const variacao = (atual: Vendas, anterior: Vendas | null) =>
  anterior && anterior.valor > 0 ? (atual.valor - anterior.valor) / anterior.valor : null

const ticket = (v: Vendas | null) => (v && v.pedidos > 0 ? v.valor / v.pedidos : null)

/** Pedidos não cancelados de um canal do CRM no intervalo (paginado: o Supabase limita a 1.000 linhas). */
async function vendasDoCrm(canal: CanalVenda, intervalo: Intervalo): Promise<Vendas> {
  const { supabase } = await exigirEquipe()
  const vendas = { ...ZERO }
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('pedidos')
      .select('total')
      .eq('canal', canal)
      .neq('status', 'cancelado')
      .gte('criado_em', inicioDoDia(intervalo.inicio))
      .lt('criado_em', inicioDoDia(somarDias(intervalo.fim, 1)))
      .order('id')
      .range(de, de + PAGINA - 1)
    if (error) throw error
    vendas.valor += data.reduce((s, p) => s + Number(p.total ?? 0), 0)
    vendas.pedidos += data.length
    if (data.length < PAGINA) return vendas
  }
}

/** Números fictícios (modo "dados de exemplo"), só para visualizar a tela antes do ERP. */
const EXEMPLO: Record<IdCanal, [Vendas, Vendas]> = {
  mercado_livre: [{ valor: 18940.5, pedidos: 142 }, { valor: 16210, pedidos: 128 }],
  shopee: [{ valor: 9870.3, pedidos: 97 }, { valor: 10450.9, pedidos: 104 }],
  shopify: [{ valor: 12310, pedidos: 61 }, { valor: 9880, pedidos: 52 }],
  grupo_vip: [{ valor: 7215, pedidos: 48 }, { valor: 6020, pedidos: 41 }],
}
const ESCALA_EXEMPLO: Record<ChavePeriodo, number> = {
  hoje: 0.05,
  '7d': 0.25,
  '30d': 1,
  '60d': 2,
  '90d': 3,
  mes: 1,
  mes_anterior: 1.12,
}

function exemplo(id: IdCanal, chave: ChavePeriodo): [Vendas, Vendas] {
  const k = ESCALA_EXEMPLO[chave]
  return EXEMPLO[id].map((v) => ({
    valor: Math.round(v.valor * k * 100) / 100,
    pedidos: Math.max(1, Math.round(v.pedidos * k)),
  })) as [Vendas, Vendas]
}

/**
 * Vendas por canal no período: Olist ERP para os marketplaces e a loja virtual,
 * CRM para o Grupo VIP. Os canais do Olist só têm números depois da primeira
 * sincronização; uma falha na leitura não derruba o painel (estado "erro").
 */
export async function vendasPorCanal(chave: ChavePeriodo, { comExemplo = false } = {}) {
  const periodo = intervalosDoPeriodo(chave, hojeISO())

  let olist: StatusOlist | null = null
  let erp: [Partial<Record<IdCanal, Vendas>> | null, Partial<Record<IdCanal, Vendas>> | null] = [null, null]
  let erroErp = false
  if (!comExemplo) {
    try {
      olist = await statusOlist()
      if (olist.ultimaSincronizacao) erp = await Promise.all([vendasDoErp(periodo.atual), vendasDoErp(periodo.anterior)])
    } catch (erro) {
      console.error('[vendas] falha ao ler as vendas do Olist', erro)
      erroErp = true
    }
  }

  const doCrm = new Map<IdCanal, [Vendas, Vendas]>()
  if (!comExemplo) {
    await Promise.all(
      CANAIS.map(async (canal) => {
        if (canal.origem.tipo !== 'crm') return
        const origem = canal.origem.canal
        doCrm.set(canal.id, await Promise.all([vendasDoCrm(origem, periodo.atual), vendasDoCrm(origem, periodo.anterior)]))
      }),
    )
  }

  const linhas = CANAIS.map((canal) => {
    let estado: EstadoCanal = 'ok'
    let par: [Vendas, Vendas] | null = null
    if (comExemplo) par = exemplo(canal.id, chave)
    else if (canal.origem.tipo === 'crm') par = doCrm.get(canal.id) ?? null
    else if (erroErp) estado = 'erro'
    else if (!erp[0]) estado = 'aguardando'
    else par = [erp[0][canal.id] ?? ZERO, erp[1]?.[canal.id] ?? ZERO]
    return { canal, estado, atual: par?.[0] ?? null, anterior: par?.[1] ?? null }
  })

  const comDados = linhas.filter((l) => l.estado === 'ok' && l.atual)
  const somar = (lista: Array<Vendas | null>) =>
    lista.reduce<Vendas>((t, v) => ({ valor: t.valor + (v?.valor ?? 0), pedidos: t.pedidos + (v?.pedidos ?? 0) }), { ...ZERO })
  const totalAtual = somar(comDados.map((l) => l.atual))
  const totalAnterior = somar(comDados.map((l) => l.anterior))

  const canais: ResumoCanal[] = linhas.map(({ canal, estado, atual, anterior }) => ({
    ...canal,
    estado,
    atual,
    anterior,
    ticket: ticket(atual),
    variacao: atual ? variacao(atual, anterior) : null,
    participacao: atual && totalAtual.valor > 0 ? atual.valor / totalAtual.valor : 0,
  }))

  return {
    periodo,
    canais,
    total: {
      ...totalAtual,
      ticket: ticket(totalAtual),
      variacao: comDados.length > 0 ? variacao(totalAtual, totalAnterior) : null,
    },
    /** Canais sem números (aguardando Olist ou com erro): o total é parcial. */
    pendentes: canais.filter((c) => c.estado !== 'ok'),
    /** Status da conexão com o Olist (null no modo exemplo). */
    olist,
    comExemplo,
  }
}

export type DadosVendasPorCanal = Awaited<ReturnType<typeof vendasPorCanal>>
