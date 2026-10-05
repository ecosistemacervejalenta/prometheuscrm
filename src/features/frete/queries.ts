import 'server-only'

import { exigirEquipe } from '@/lib/auth'

export type ResumoCeps = { faixas: number; ceps_avulsos: number; ceps_cobertos: number }

/** Tamanho da lista de CEPs VIP (Configurações › Frete VIP e avisos do Grupo VIP). */
export async function resumoCepsVip(): Promise<ResumoCeps> {
  const { supabase } = await exigirEquipe()
  const { data } = await supabase.rpc('resumo_ceps_frete_vip')
  const resumo = data as Partial<ResumoCeps> | null
  return {
    faixas: Number(resumo?.faixas ?? 0),
    ceps_avulsos: Number(resumo?.ceps_avulsos ?? 0),
    ceps_cobertos: Number(resumo?.ceps_cobertos ?? 0),
  }
}
