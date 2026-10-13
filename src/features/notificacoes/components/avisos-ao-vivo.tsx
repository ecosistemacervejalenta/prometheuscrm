'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { useAvisos } from '@/components/ui/toaster'
import { createClient } from '@/lib/supabase/client'

const CHAVE_SESSAO = 'prometheus:avisos-lembrados'

/**
 * Avisos em tempo real para o membro logado (montado uma vez no layout do CRM):
 *   • ao entrar, lembra uma vez por sessão dos avisos ainda não lidos;
 *   • aviso novo (ex.: "Ana marcou você na tarefa #12") → toast, sino atualizado
 *     e, com a aba em segundo plano e permissão dada, notificação do navegador.
 */
export function AvisosAoVivo({ meuId, naoLidos }: { meuId: string; naoLidos: number }) {
  const router = useRouter()
  const avisar = useAvisos()
  const lembrado = useRef(false)

  useEffect(() => {
    if (lembrado.current || naoLidos <= 0) return
    lembrado.current = true
    try {
      if (sessionStorage.getItem(CHAVE_SESSAO)) return
      sessionStorage.setItem(CHAVE_SESSAO, '1')
    } catch {
      return
    }
    avisar(naoLidos === 1 ? 'Você tem 1 aviso novo de tarefa. Veja no sino.' : `Você tem ${naoLidos} avisos novos de tarefas. Veja no sino.`)
  }, [naoLidos, avisar])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`avisos-${meuId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${meuId}` }, (mudanca) => {
        const novo = mudanca.new as { titulo?: string; texto?: string | null }
        const texto = novo.texto ? `${novo.titulo}: ${novo.texto}` : (novo.titulo ?? 'Novo aviso')
        avisar(texto.length > 160 ? `${texto.slice(0, 157)}…` : texto)
        router.refresh()
        try {
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Prometheus · Tarefas', { body: texto.slice(0, 160), tag: 'prometheus-tarefas' })
          }
        } catch {
          // Navegador sem notificações: o toast e o sino bastam.
        }
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [meuId, router, avisar])

  return null
}
