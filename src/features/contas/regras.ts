import { COR_NEUTRA, PALETA_CATEGORICA } from '@/lib/paleta'

/** Regras puras das contas fixas (resumo da tela de contas fixas). */

/** Projeto padrão: custo usado por toda a empresa. */
export const PROJETO_GERAL = 'Geral'

type ContaFixaBase = {
  valor: number
  categoria: string
  projeto: string
  ativa: boolean
  inicio_em: string
  fim_em: string | null
}

export type GrupoCusto<T> = { nome: string; valor: number; contas: T[] }

/** Por que uma conta fixa não entra no custo do mês. */
export type ForaDoTotal = 'pausada' | 'encerrada' | 'futura'

/** Conta no custo do mês `mes` ("YYYY-MM") se está ativa, já começou e não terminou. */
export function motivoForaDoTotal(c: ContaFixaBase, mes: string): ForaDoTotal | null {
  if (!c.ativa) return 'pausada'
  if (c.fim_em && c.fim_em.slice(0, 7) < mes) return 'encerrada'
  if (c.inicio_em.slice(0, 7) > mes) return 'futura'
  return null
}

const somar = (contas: ContaFixaBase[]) => Math.round(contas.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100

function agrupar<T extends ContaFixaBase>(contas: T[], chave: 'categoria' | 'projeto'): GrupoCusto<T>[] {
  const grupos = new Map<string, T[]>()
  for (const c of contas) grupos.set(c[chave], [...(grupos.get(c[chave]) ?? []), c])
  return [...grupos.entries()]
    .map(([nome, lista]) => ({ nome, valor: somar(lista), contas: lista }))
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Custo fixo do mês: total, por categoria e por projeto (do maior para o menor) e o que ficou de fora. */
export function resumirContasFixas<T extends ContaFixaBase>(contas: T[], mes: string) {
  const vigentes = contas.filter((c) => !motivoForaDoTotal(c, mes))
  return {
    total: somar(vigentes),
    quantidade: vigentes.length,
    porCategoria: agrupar(vigentes, 'categoria'),
    porProjeto: agrupar(vigentes, 'projeto'),
    foraDoTotal: contas.filter((c) => motivoForaDoTotal(c, mes)),
  }
}

/**
 * Cor de cada projeto: "Geral" fica neutro; os demais, em ordem alfabética, recebem
 * as cores da paleta (a cor segue o projeto, não o valor). Depois da 7ª, neutro.
 */
export function coresDosProjetos(projetos: string[]): Record<string, string> {
  const outros = [...new Set(projetos)]
    .filter((p) => p !== PROJETO_GERAL)
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  return Object.fromEntries([
    [PROJETO_GERAL, COR_NEUTRA],
    ...outros.map((p, i) => [p, PALETA_CATEGORICA[i] ?? COR_NEUTRA]),
  ])
}
