'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'

/**
 * Mantém o quadro ao vivo: qualquer mudança em tarefas, responsáveis, imagens ou
 * histórico (Supabase Realtime, com RLS) recarrega os dados do servidor.
 * Como garantia, recarrega a cada minuto com a aba visível.
 */
export function QuadroAoVivo() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let espera: ReturnType<typeof setTimeout> | undefined
    const atualizar = () => {
      clearTimeout(espera)
      espera = setTimeout(() => router.refresh(), 400)
    }

    const canal = supabase
      .channel('tarefas-quadro')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_responsaveis' }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_anexos' }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_eventos' }, atualizar)
      .subscribe()

    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 60_000)
    const aoVoltar = () => document.visibilityState === 'visible' && router.refresh()
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      clearTimeout(espera)
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
      void supabase.removeChannel(canal)
    }
  }, [router])

  return null
}
