'use client'

import { Check, ChevronDown, ExternalLink } from 'lucide-react'
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button, ButtonExternal } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Passo a passo de uma conexão (mesmo formato do guia do WhatsApp oficial).
 * Os passos que o CRM confere sozinho (dados salvos, conta conectada) ficam verdes
 * automaticamente; os demais a equipe marca como feitos (lembrado neste navegador).
 */

export type Passo = {
  chave: string
  titulo: string
  resumo: string
  /** Confirmado pelo CRM (true/false); undefined = a equipe marca como feito. */
  confirmado?: boolean
  dicaConfirmacao?: string
  links?: Array<{ href: string; rotulo: string }>
  conteudo: ReactNode
}

const EVENTO = 'prometheus:guia-marketplaces'

function inscrever(aviso: () => void) {
  window.addEventListener(EVENTO, aviso)
  window.addEventListener('storage', aviso)
  return () => {
    window.removeEventListener(EVENTO, aviso)
    window.removeEventListener('storage', aviso)
  }
}

function useMarcados(chaveArmazenamento: string) {
  const ler = () => {
    try {
      return window.localStorage.getItem(chaveArmazenamento) ?? ''
    } catch {
      return ''
    }
  }
  const texto = useSyncExternalStore(inscrever, ler, () => '')
  const marcados = useMemo(() => new Set(texto.split(',').filter(Boolean)), [texto])
  function alternar(chave: string) {
    const novos = new Set(marcados)
    if (novos.has(chave)) novos.delete(chave)
    else novos.add(chave)
    try {
      window.localStorage.setItem(chaveArmazenamento, [...novos].join(','))
    } catch {
      // armazenamento indisponível: a marcação vale só até recarregar
    }
    window.dispatchEvent(new Event(EVENTO))
  }
  return { marcados, alternar }
}

export function GuiaPassos({
  id,
  titulo,
  descricao,
  passos,
}: {
  /** Identifica o guia no navegador (passos marcados como feitos). */
  id: string
  titulo: string
  descricao: string
  passos: Passo[]
}) {
  const { marcados, alternar } = useMarcados(`prometheus:guia-${id}`)
  const feito = (p: Passo) => p.confirmado ?? marcados.has(p.chave)
  const concluidos = passos.filter(feito).length
  const atual = passos.findIndex((p) => !feito(p))

  return (
    <Card>
      <CardHeader
        titulo={titulo}
        descricao={descricao}
        acoes={
          <span className="tipo-dado text-[13px] text-suave">
            {concluidos} de {passos.length}
          </span>
        }
      />
      <div className="px-4 pb-4 lg:px-5">
        <div className="h-2 overflow-hidden rounded-full bg-papel ring-1 ring-linha ring-inset">
          <div className="h-full rounded-full bg-volt transition-[width]" style={{ width: `${(concluidos / passos.length) * 100}%` }} />
        </div>
      </div>
      <ol className="border-t border-linha">
        {passos.map((p, i) => {
          const ok = feito(p)
          const automatico = p.confirmado !== undefined
          return (
            <li key={p.chave} className="border-b border-linha last:border-b-0">
              <details open={i === atual} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-papel/60 lg:px-5 [&::-webkit-details-marker]:hidden">
                  <span
                    className={cn(
                      'tipo-dado grid size-7 shrink-0 place-items-center rounded-full text-[12px]',
                      ok ? 'bg-volt text-ink' : 'bg-ink text-white',
                    )}
                  >
                    {ok ? <Check className="size-4" aria-label="Concluído" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{p.titulo}</span>
                    <span className="block text-[13px] text-suave">{p.resumo}</span>
                  </span>
                  {ok && <Badge tom="sucesso" className="max-sm:hidden">Feito</Badge>}
                  <ChevronDown className="size-4 shrink-0 text-sutil transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-4 px-4 pb-5 pl-14 text-sm lg:px-5 lg:pl-15">
                  {p.conteudo}
                  <div className="flex flex-wrap items-center gap-2">
                    {p.links?.map((l) => (
                      <ButtonExternal key={l.href} href={l.href} tamanho="sm">
                        <ExternalLink /> {l.rotulo}
                      </ButtonExternal>
                    ))}
                    {automatico ? (
                      <span className="text-[12px] text-suave">{p.dicaConfirmacao}</span>
                    ) : (
                      <Button tamanho="sm" variante={ok ? 'fantasma' : 'escuro'} onClick={() => alternar(p.chave)}>
                        <Check /> {ok ? 'Desmarcar' : 'Marcar como feito'}
                      </Button>
                    )}
                  </div>
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
