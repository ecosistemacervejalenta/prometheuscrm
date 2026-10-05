import 'server-only'

import { exigirEquipe } from '@/lib/auth'
import type { NaturezaFinanceira } from '@/types'

import { ordenarCategorias } from './regras'

/** Nomes das categorias de uma natureza, para o campo "Categoria" dos formulários. */
export async function nomesDasCategorias(natureza: NaturezaFinanceira): Promise<string[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('categorias_financeiras').select('nome').eq('natureza', natureza)
  if (error) throw error
  return ordenarCategorias(data.map((c) => c.nome))
}

/** Todas as categorias, separadas por natureza e em ordem alfabética ("Outros" no fim). */
export async function listarCategorias() {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.from('categorias_financeiras').select('id, natureza, nome')
  if (error) throw error

  const porNatureza = (natureza: NaturezaFinanceira) => {
    const lista = data.filter((c) => c.natureza === natureza)
    return ordenarCategorias(lista.map((c) => c.nome)).map((nome) => lista.find((c) => c.nome === nome)!)
  }
  return { pagar: porNatureza('pagar'), receber: porNatureza('receber') }
}
