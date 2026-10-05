import 'server-only'

import { statusOlist, type StatusOlist } from '@/features/olist/queries'
import { exigirEquipe } from '@/lib/auth'
import { hojeISO, somarDias } from '@/lib/datas'
import type { CanalVenda } from '@/types'

import { CANAIS, type Canal, type IdCanal } from './canais'
import { vendasDoErp, vendasDoErpPorDia } from './erp'
import { intervalosDoPeriodo, type ChavePeriodo, type Intervalo } from './periodos'
import { montarSerie, somarVendas, totaisDaSerie, type Serie, type Vendas, type VendasPorCanal } from './serie'

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

const variacao = (atual: Vendas, anterior: Vendas | null) =>
  anterior && anterior.valor > 0 ? (atual.valor - anterior.valor) / anterior.valor : null

const ticket = (v: Vendas | null) => (v && v.pedidos > 0 ? v.valor / v.pedidos : null)

/** Vendas por dia de um canal do CRM (função no banco: sem cancelados, dia de Brasília). */
async function vendasDoCrmPorDia(canal: CanalVenda, intervalo: Intervalo): Promise<Map<string, Vendas>> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('vendas_crm_por_dia', { p_canal: canal, p_inicio: intervalo.inicio, p_fim: intervalo.fim })
  if (error) throw error
  return new Map((data ?? []).map((l) => [String(l.dia).slice(0, 10), { valor: Number(l.valor), pedidos: Number(l.pedidos) }]))
}

const somarMapa = (mapa: Map<string, Vendas>) => [...mapa.values()].reduce<Vendas>((t, v) => somarVendas(t, v), { ...ZERO })

/** Números fictícios (modo "dados de exemplo"): média diária por canal e variação vs. período anterior. */
const EXEMPLO: Record<IdCanal, { porDia: Vendas; crescimento: number }> = {
  mercado_livre: { porDia: { valor: 631.35, pedidos: 4.7 }, crescimento: 0.168 },
  shopee: { porDia: { valor: 329.01, pedidos: 3.2 }, crescimento: -0.056 },
  shopify: { porDia: { valor: 410.33, pedidos: 2 }, crescimento: 0.246 },
  grupo_vip: { porDia: { valor: 240.5, pedidos: 1.6 }, crescimento: 0.199 },
}

function exemploPorDia(intervalo: Intervalo): Map<string, VendasPorCanal> {
  const porDia = new Map<string, VendasPorCanal>()
  let i = 0
  for (let dia = intervalo.inicio; dia <= intervalo.fim; dia = somarDias(dia, 1), i++) {
    const vendas: VendasPorCanal = {}
    CANAIS.forEach((canal, c) => {
      // Oscilação determinística (sem aleatoriedade: a tela não muda a cada recarga).
      const fator = 1 + 0.45 * Math.sin(i / 2.3 + c * 1.7) + 0.2 * Math.cos(i / 5.1 + c)
      const base = EXEMPLO[canal.id].porDia
      vendas[canal.id] = {
        valor: Math.max(0, Math.round(base.valor * fator * 100) / 100),
        pedidos: Math.max(0, Math.round(base.pedidos * fator)),
      }
    })
    porDia.set(dia, vendas)
  }
  return porDia
}

/**
 * Vendas por canal no período: Olist ERP para os marketplaces e a loja virtual,
 * CRM para o Grupo VIP. Os totais saem da mesma série diária do gráfico, então
 * cartões, pizza e evolução sempre batem entre si. Os canais do Olist só têm
 * números depois da 1ª sincronização; uma falha na leitura não derruba o painel.
 */
export async function vendasPorCanal(chave: ChavePeriodo, { comExemplo = false } = {}) {
  const periodo = intervalosDoPeriodo(chave, hojeISO())

  let olist: StatusOlist | null = null
  let erroErp = false
  let erpPorDia: Map<string, VendasPorCanal> | null = null
  let erpAnterior: VendasPorCanal | null = null
  const crmPorDia = new Map<IdCanal, Map<string, Vendas>>()
  const crmAnterior = new Map<IdCanal, Vendas>()
  const crmComErro = new Set<IdCanal>()

  if (comExemplo) {
    erpPorDia = exemploPorDia(periodo.atual)
  } else {
    try {
      olist = await statusOlist()
      if (olist.ultimaSincronizacao) {
        ;[erpPorDia, erpAnterior] = await Promise.all([vendasDoErpPorDia(periodo.atual), vendasDoErp(periodo.anterior)])
      }
    } catch (erro) {
      console.error('[vendas] falha ao ler as vendas do Olist', erro)
      erroErp = true
    }
    await Promise.all(
      CANAIS.map(async (canal) => {
        if (canal.origem.tipo !== 'crm') return
        try {
          const [atual, anterior] = await Promise.all([
            vendasDoCrmPorDia(canal.origem.canal, periodo.atual),
            vendasDoCrmPorDia(canal.origem.canal, periodo.anterior),
          ])
          crmPorDia.set(canal.id, atual)
          crmAnterior.set(canal.id, somarMapa(anterior))
        } catch (erro) {
          console.error(`[vendas] falha ao ler as vendas do CRM (${canal.id})`, erro)
          crmComErro.add(canal.id)
        }
      }),
    )
  }

  const estados = new Map<IdCanal, EstadoCanal>(
    CANAIS.map((canal) => [
      canal.id,
      comExemplo
        ? 'ok'
        : canal.origem.tipo === 'crm'
          ? crmComErro.has(canal.id)
            ? 'erro'
            : 'ok'
          : erroErp
            ? 'erro'
            : erpPorDia
              ? 'ok'
              : 'aguardando',
    ]),
  )

  // Série diária única com os canais que têm dados.
  const porDia = new Map<string, VendasPorCanal>()
  for (let dia = periodo.atual.inicio; dia <= periodo.atual.fim; dia = somarDias(dia, 1)) {
    const vendas: VendasPorCanal = {}
    for (const canal of CANAIS) {
      if (estados.get(canal.id) !== 'ok') continue
      const v = canal.origem.tipo === 'crm' && !comExemplo ? crmPorDia.get(canal.id)?.get(dia) : erpPorDia?.get(dia)?.[canal.id]
      if (v) vendas[canal.id] = v
    }
    porDia.set(dia, vendas)
  }
  const serie: Serie = montarSerie(periodo.atual, porDia)
  const totaisAtuais = totaisDaSerie(serie)

  const anteriorDe = (canal: Canal): Vendas => {
    if (comExemplo) {
      const atual = totaisAtuais[canal.id] ?? ZERO
      const k = 1 + EXEMPLO[canal.id].crescimento
      return { valor: Math.round((atual.valor / k) * 100) / 100, pedidos: Math.round(atual.pedidos / k) }
    }
    return canal.origem.tipo === 'crm' ? (crmAnterior.get(canal.id) ?? ZERO) : (erpAnterior?.[canal.id] ?? ZERO)
  }

  const linhas = CANAIS.map((canal) => {
    const estado = estados.get(canal.id)!
    return estado === 'ok'
      ? { canal, estado, atual: totaisAtuais[canal.id] ?? { ...ZERO }, anterior: anteriorDe(canal) }
      : { canal, estado, atual: null, anterior: null }
  })

  const comDados = linhas.filter((l) => l.estado === 'ok' && l.atual)
  const totalAtual = comDados.reduce<Vendas>((t, l) => somarVendas(t, l.atual!), { ...ZERO })
  const totalAnterior = comDados.reduce<Vendas>((t, l) => somarVendas(t, l.anterior ?? undefined), { ...ZERO })

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
    serie,
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
