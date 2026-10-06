'use client'

import { Check, Plus, Settings2, Tag } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'

import { criarEtiquetaNoAtendimento, marcarEtiqueta } from '../actions'
import type { CorEtiqueta, Etiqueta } from '../schema'
import { corSugerida, EtiquetaChip, FUNDO_ETIQUETA, SeletorCor } from './etiqueta'

type Mudanca = { etiqueta: Etiqueta; marcar: boolean }

function aplicarMudanca(atuais: Etiqueta[], { etiqueta, marcar }: Mudanca) {
  const sem = atuais.filter((e) => e.id !== etiqueta.id)
  return marcar ? [...sem, etiqueta] : sem
}

/** "Transportadora" encontra "verificando com a transportadora" (sem acento e sem caixa). */
const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Faixa logo abaixo do cabeçalho da conversa: as etiquetas do atendimento (com X para
 * tirar) e o seletor para colocar outras ou criar uma nova na hora.
 */
export function EtiquetasDoAtendimento({
  atendimentoId,
  aplicadas,
  todas,
}: {
  atendimentoId: string
  aplicadas: Etiqueta[]
  todas: Etiqueta[]
}) {
  const [visiveis, aplicar] = useOptimistic(aplicadas, aplicarMudanca)
  const [, iniciar] = useTransition()
  const [criando, iniciarCriacao] = useTransition()
  const avisar = useAvisos()
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [corEscolhida, setCorEscolhida] = useState<CorEtiqueta | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  const marcadas = new Set(visiveis.map((e) => e.id))
  const nomeNovo = termo.trim().replace(/\s+/g, ' ')
  const filtradas = nomeNovo ? todas.filter((e) => semAcento(e.nome).includes(semAcento(nomeNovo))) : todas
  const exata = todas.find((e) => e.nome.toLowerCase() === nomeNovo.toLowerCase())
  const podeCriar = nomeNovo.length > 0 && nomeNovo.length <= 40 && !exata
  const cor = corEscolhida ?? corSugerida(todas)

  useEffect(() => {
    if (!aberto) return
    const fechar = () => {
      setAberto(false)
      setTermo('')
    }
    const clicouFora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) fechar()
    }
    const apertouEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('pointerdown', clicouFora)
    document.addEventListener('keydown', apertouEsc)
    return () => {
      document.removeEventListener('pointerdown', clicouFora)
      document.removeEventListener('keydown', apertouEsc)
    }
  }, [aberto])

  const alternar = (etiqueta: Etiqueta, marcar: boolean) =>
    iniciar(async () => {
      aplicar({ etiqueta, marcar })
      const r = await marcarEtiqueta(atendimentoId, etiqueta.id, marcar)
      if (r.ok === false && r.mensagem) avisar(r.mensagem, 'erro')
    })

  const criar = () => {
    if (!podeCriar || criando) return
    iniciarCriacao(async () => {
      const r = await criarEtiquetaNoAtendimento(atendimentoId, nomeNovo, cor)
      if (r.mensagem) avisar(r.mensagem, r.ok === false ? 'erro' : 'sucesso')
      if (r.ok === false) return
      setTermo('')
      setCorEscolhida(null)
    })
  }

  return (
    <div ref={caixa} className="relative flex min-w-0 flex-wrap items-center gap-1.5 border-b border-linha bg-superficie px-3 py-1.5">
      {visiveis.map((e) => (
        <EtiquetaChip key={e.id} etiqueta={e} tamanho="md" aoRemover={() => alternar(e, false)} />
      ))}
      <button
        type="button"
        onClick={() => {
          setAberto(!aberto)
          setTermo('')
        }}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold transition-colors',
          aberto ? 'bg-ink/[0.06] text-ink' : 'text-suave hover:bg-papel hover:text-ink',
        )}
      >
        {visiveis.length ? <Plus className="size-3.5" aria-hidden /> : <Tag className="size-3.5" aria-hidden />}
        {visiveis.length ? 'Etiqueta' : 'Adicionar etiqueta'}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Etiquetas do atendimento"
          className="absolute top-full left-2 z-30 mt-1 w-[min(20rem,calc(100%-1rem))] rounded-xl border border-linha bg-superficie p-2 shadow-flutuante"
        >
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const alvo = exata ?? (filtradas.length === 1 ? filtradas[0] : null)
              if (alvo) alternar(alvo, !marcadas.has(alvo.id))
              else criar()
            }}
            maxLength={40}
            placeholder={todas.length ? 'Buscar ou criar etiqueta' : 'Nome da nova etiqueta'}
            aria-label="Buscar ou criar etiqueta"
            className="h-9 w-full rounded-lg border border-linha bg-superficie px-3 text-sm outline-none placeholder:text-sutil focus:border-ink focus:ring-4 focus:ring-volt/25"
          />

          {filtradas.length > 0 && (
            <ul className="mt-1 max-h-60 overflow-y-auto overscroll-contain">
              {filtradas.map((e) => {
                const marcada = marcadas.has(e.id)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-pressed={marcada}
                      onClick={() => alternar(e, !marcada)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-papel"
                    >
                      <span className={cn('size-3 shrink-0 rounded-full', FUNDO_ETIQUETA[e.cor])} aria-hidden />
                      <span className={cn('min-w-0 flex-1 truncate', marcada && 'font-semibold')}>{e.nome}</span>
                      {marcada && <Check className="size-4 shrink-0" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {podeCriar ? (
            <div className="mt-1 space-y-2.5 border-t border-linha px-1 pt-2.5">
              <div className="flex min-w-0 items-center gap-2 text-[12px] text-suave">
                Nova:
                <EtiquetaChip etiqueta={{ id: 'nova', nome: nomeNovo, cor }} tamanho="md" />
              </div>
              <SeletorCor name="cor-nova-etiqueta" valor={cor} aoMudar={setCorEscolhida} />
              <Button tamanho="sm" variante="escuro" bloco carregando={criando} onClick={criar}>
                <Plus /> Criar e colocar
              </Button>
            </div>
          ) : (
            filtradas.length === 0 && (
              <p className="px-2 py-3 text-center text-[12px] text-suave">
                {todas.length ? 'Nenhuma etiqueta com esse nome.' : 'Digite o nome para criar a primeira etiqueta (ex.: Produto quebrado).'}
              </p>
            )
          )}

          <Link
            href="/configuracoes/etiquetas"
            className="mt-2 flex items-center gap-1.5 border-t border-linha px-2 pt-2 pb-0.5 text-[12px] font-semibold text-suave hover:text-ink"
          >
            <Settings2 className="size-3.5" aria-hidden /> Gerenciar etiquetas
          </Link>
        </div>
      )}
    </div>
  )
}
