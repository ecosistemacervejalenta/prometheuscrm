import { somarDias, somarMeses, somarMesesData } from '@/lib/datas'
import { formatarMes } from '@/lib/format'

/** Períodos do painel de vendas. Datas inclusivas "YYYY-MM-DD", no fuso de Brasília. */

export type ChavePeriodo = 'hoje' | '7d' | 'mes' | 'mes_anterior'

export const PERIODOS: Array<{ chave: ChavePeriodo; rotulo: string }> = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: '7d', rotulo: '7 dias' },
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_anterior', rotulo: 'Mês passado' },
]

export const PERIODO_PADRAO: ChavePeriodo = 'mes'

export function periodoValido(valor: string | undefined): ChavePeriodo {
  return PERIODOS.some((p) => p.chave === valor) ? (valor as ChavePeriodo) : PERIODO_PADRAO
}

export type Intervalo = { inicio: string; fim: string }

const ultimoDiaDoMes = (mes: string) => somarDias(`${somarMeses(mes, 1)}-01`, -1)
const nomeDoMes = (mes: string) => formatarMes(mes).split(' ')[0].toLowerCase()

/**
 * Intervalo do período escolhido e o período equivalente anterior (para a variação).
 * "Este mês" compara com os mesmos dias do mês passado (1º até o dia de hoje).
 */
export function intervalosDoPeriodo(chave: ChavePeriodo, hoje: string) {
  const mes = hoje.slice(0, 7)
  switch (chave) {
    case 'hoje': {
      const ontem = somarDias(hoje, -1)
      return { atual: { inicio: hoje, fim: hoje }, anterior: { inicio: ontem, fim: ontem }, descricao: 'Hoje', comparacao: 'vs. ontem' }
    }
    case '7d':
      return {
        atual: { inicio: somarDias(hoje, -6), fim: hoje },
        anterior: { inicio: somarDias(hoje, -13), fim: somarDias(hoje, -7) },
        descricao: 'Últimos 7 dias',
        comparacao: 'vs. 7 dias anteriores',
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
    case 'mes': {
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
