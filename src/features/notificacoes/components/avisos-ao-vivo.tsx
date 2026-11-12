'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { useAvisos } from '@/components/ui/toaster'
import { createClient } from '@/lib/supabase/client'

const CHAVE_SESSAO = 'prometheus:avisos-lembrados'

type LinhaAviso = {
  tipo?: string
  titulo?: string
  texto?: string | null
  lida_em?: string | null
  atendimento_id?: string | null
}

/** Já está com esta conversa aberta e visível: o bip do Atendimento basta, sem balão repetido. */
function vendoAConversa(atendimentoId: string | null | undefined) {
  if (!atendimentoId || document.hidden || window.location.pathname !== '/atendimento') return false
  return new URLSearchParams(window.location.search).get('id') === atendimentoId
}

/**
 * Avisos em tempo real para o membro logado (montado uma vez no layout do CRM):
 *   • ao entrar, lembra uma vez por sessão dos avisos ainda não lidos;
 *   • aviso novo (ex.: "Ana marcou você na tarefa #12", "Novo cliente para você: João")
 *     → toast, sino atualizado e, com a aba em segundo plano e permissão dada,
 *     notificação do navegador;
 *   • mensagem nova numa conversa que já tinha aviso não lido → o mesmo aviso é
 *     atualizado no banco (UPDATE) e avisa de novo.
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
    avisar(naoLidos === 1 ? 'Você tem 1 aviso novo. Veja no sino.' : `Você tem ${naoLidos} avisos novos. Veja no sino.`)
  }, [naoLidos, avisar])

  useEffect(() => {
    const supabase = createClient()
    // "Marcar todos como lidos" muda vários avisos de uma vez: uma atualização só.
    let espera: ReturnType<typeof setTimeout> | undefined
    const aoMudar = (novo: LinhaAviso) => {
      clearTimeout(espera)
      espera = setTimeout(() => router.refresh(), 300)
      // Marcado como lido (aqui ou em outra aba): só atualiza o sino.
      if (novo.lida_em || vendoAConversa(novo.atendimento_id)) return

      const texto = novo.texto ? `${novo.titulo}: ${novo.texto}` : (novo.titulo ?? 'Novo aviso')
      avisar(texto.length > 160 ? `${texto.slice(0, 157)}…` : texto)
      try {
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const whatsapp = Boolean(novo.atendimento_id)
          // Mesma tag da tela de Atendimento: o navegador troca a notificação em vez de empilhar duas.
          new Notification(whatsapp ? 'Prometheus · WhatsApp' : 'Prometheus · Tarefas', {
            body: (whatsapp && novo.texto ? `${novo.titulo}\n${novo.texto}` : texto).slice(0, 200),
            tag: whatsapp ? 'prometheus-atendimento' : 'prometheus-tarefas',
          })
        }
      } catch {
        // Navegador sem notificações: o toast e o sino bastam.
      }
    }

    const filtro = { schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${meuId}` }
    const canal = supabase
      .channel(`avisos-${meuId}`)
      .on('postgres_changes', { event: 'INSERT', ...filtro }, (mudanca) => aoMudar(mudanca.new as LinhaAviso))
      .on('postgres_changes', { event: 'UPDATE', ...filtro }, (mudanca) => aoMudar(mudanca.new as LinhaAviso))
      .subscribe()
    return () => {
      clearTimeout(espera)
      void supabase.removeChannel(canal)
    }
  }, [meuId, router, avisar])

  return null
}
