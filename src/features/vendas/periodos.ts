import { somarDias, somarMeses, somarMesesData } from '@/lib/datas'
import { formatarMes } from '@/lib/format'

/** Períodos do painel de vendas. Datas inclusivas "YYYY-MM-DD", no fuso de Brasília. */

export type ChavePeriodo = 'hoje' | '7d' | '30d' | '60d' | '90d' | 'mes' | 'mes_anterior'

export const PERIODOS: Array<{ chave: ChavePeriodo; rotulo: string }> = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: '7d', rotulo: '7 dias' },
  { chave: '30d', rotulo: '30 dias' },
  { chave: '60d', rotulo: '60 dias' },
  { chave: '90d', rotulo: '90 dias' },
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_anterior', rotulo: 'Mês passado' },
]

/** "Últimos N dias", contados como no Olist: de hoje − N dias até hoje (inclusive). */
const DIAS: Partial<Record<ChavePeriodo, number>> = { '7d': 7, '30d': 30, '60d': 60, '90d': 90 }

export const PERIODO_PADRAO: ChavePeriodo = 'mes'

export function periodoValido(valor: string | undefined): ChavePeriodo {
  return PERIODOS.some((p) => p.chave === valor) ? (valor as ChavePeriodo) : PERIODO_PADRAO
}

export type Intervalo = { inicio: string; fim: string }

const ultimoDiaDoMes = (mes: string) => somarDias(`${somarMeses(mes, 1)}-01`, -1)
const nomeDoMes = (mes: string) => formatarMes(mes).split(' ')[0].toLowerCase()

/**
 * Intervalo do período escolhido e o período equivalente anterior (para a variação).
 * "Últimos N dias" compara com os N dias imediatamente antes (mesmo tamanho);
 * "Este mês" compara com os mesmos dias do mês passado (1º até o dia de hoje).
 */
export function intervalosDoPeriodo(chave: ChavePeriodo, hoje: string) {
  const mes = hoje.slice(0, 7)
  const dias = DIAS[chave]
  if (dias) {
    const inicio = somarDias(hoje, -dias)
    return {
      atual: { inicio, fim: hoje },
      anterior: { inicio: somarDias(inicio, -(dias + 1)), fim: somarDias(inicio, -1) },
      descricao: `Últimos ${dias} dias`,
      comparacao: `vs. ${dias} dias anteriores`,
    }
  }
  switch (chave) {
    case 'hoje': {
      const ontem = somarDias(hoje, -1)
      return { atual: { inicio: hoje, fim: hoje }, anterior: { inicio: ontem, fim: ontem }, descricao: 'Hoje', comparacao: 'vs. ontem' }
    }
    case 'mes_anterior': {
      const passado = somarMeses(mes, -1)
      const retrasado = somarMeses(mes, -2)
      return {
        atual: { inicio: `${passado}-01`, fim: ultimoDiaDoMes(passado) },
        anterior: { inicio: `${retrasado}-01`, fim: ultimoDiaDoMes(retrasado) },
        descricao: formatarMes(passado),
        comparacao: `vs. ${nomeDoMes(retrasado)}`,
      }
    }
    default: {
      // 'mes'
      const passado = somarMeses(mes, -1)
      return {
        atual: { inicio: `${mes}-01`, fim: hoje },
        anterior: { inicio: `${passado}-01`, fim: somarMesesData(hoje, -1) },
        descricao: `${formatarMes(mes)} (até hoje)`,
        comparacao: `vs. mesmo período de ${nomeDoMes(passado)}`,
      }
    }
  }
}
