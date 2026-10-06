'use client'

import { Bell, BellOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { createClient } from '@/lib/supabase/client'

/**
 * Mantém a caixa de entrada ao vivo: qualquer mudança em atendimentos, mensagens,
 * eventos ou etiquetas (Supabase Realtime, com RLS) recarrega os dados do servidor.
 * Como garantia, recarrega a cada 45 s com a aba visível.
 * Mensagem recebida → bip curto e, com a aba em segundo plano, notificação do navegador.
 */

function bip() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.09)
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime)
    ganho.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.connect(ganho).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.26)
    osc.onended = () => void ctx.close()
  } catch {
    // Sem áudio (navegador bloqueou antes de um clique): segue sem som.
  }
}

type Permissao = NotificationPermission | 'indisponivel'

const semInscricao = () => () => {}
const permissaoAtual = (): Permissao => ('Notification' in window ? Notification.permission : 'indisponivel')

export function AtualizacaoAoVivo({ pendentes }: { pendentes: number }) {
  const router = useRouter()
  const permissaoDoNavegador = useSyncExternalStore(semInscricao, permissaoAtual, (): Permissao => 'indisponivel')
  const [respondida, setRespondida] = useState<Permissao | null>(null)
  const permissao = respondida ?? permissaoDoNavegador
  const permissaoRef = useRef(permissao)

  useEffect(() => {
    permissaoRef.current = permissao
  }, [permissao])

  useEffect(() => {
    document.title = pendentes > 0 ? `(${pendentes}) Atendimento · Prometheus` : 'Atendimento · Prometheus'
  }, [pendentes])

  useEffect(() => {
    const supabase = createClient()
    let espera: ReturnType<typeof setTimeout> | undefined
    const atualizar = () => {
      clearTimeout(espera)
      espera = setTimeout(() => router.refresh(), 300)
    }

    const canal = supabase
      .channel('atendimento-whatsapp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimento_eventos' }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos_etiquetas' }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etiquetas_atendimento' }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_mensagens' }, (mudanca) => {
        atualizar()
        const nova = mudanca.eventType === 'INSERT' ? (mudanca.new as { direcao?: string; tipo?: string; texto?: string | null }) : null
        if (nova?.direcao !== 'entrada') return
        bip()
        if (document.hidden && permissaoRef.current === 'granted') {
          new Notification('Nova mensagem no WhatsApp', {
            body: nova.tipo === 'texto' && nova.texto ? nova.texto.slice(0, 120) : 'Mídia recebida',
            tag: 'prometheus-atendimento',
          })
        }
      })
      .subscribe()

    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 45_000)
    const aoVoltar = () => document.visibilityState === 'visible' && router.refresh()
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      clearTimeout(espera)
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
      void supabase.removeChannel(canal)
    }
  }, [router])

  if (permissao !== 'default') {
    return permissao === 'denied' ? (
      <span className="inline-flex items-center gap-1 text-[12px] text-sutil" title="Notificações bloqueadas no navegador">
        <BellOff className="size-3.5" aria-hidden /> Avisos bloqueados
      </span>
    ) : null
  }
  return (
    <button
      type="button"
      onClick={() => void Notification.requestPermission().then(setRespondida)}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-volt-700 hover:bg-volt-50"
    >
      <Bell className="size-3.5" aria-hidden /> Ativar avisos
    </button>
  )
}
