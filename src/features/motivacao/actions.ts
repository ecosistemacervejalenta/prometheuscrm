'use server'

import { headers } from 'next/headers'

import { exigirEquipe } from '@/lib/auth'
import { hojeISO } from '@/lib/datas'

import { fraseDoDia, type Frase } from './frases'

/**
 * Frase do dia, se este login ainda não a viu hoje neste IP — e já marca como vista.
 * Devolve null quando o pop-up não deve aparecer.
 */
export async function abrirFraseDoDia(): Promise<Frase | null> {
  const { supabase, perfil } = await exigirEquipe()
  const dia = hojeISO()
  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'local').trim().slice(0, 64)

  // Só devolve a linha se ela acabou de nascer: já existir (mesmo perfil, dia e IP) = já viu hoje.
  const { data, error } = await supabase
    .from('frase_do_dia_vistas')
    .upsert({ perfil_id: perfil.id, dia, ip }, { onConflict: 'perfil_id,dia,ip', ignoreDuplicates: true })
    .select('dia')
  if (error || !data.length) return null
  return fraseDoDia(dia)
}
