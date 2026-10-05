'use client'

import { Check, Send } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Button, classesBotao } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { valorParaInput } from '@/lib/format'
import { cn } from '@/lib/utils'

import { cotarFrete } from '../actions'

/** Campo para lançar o frete de um pedido "a cotar" (ou corrigir o valor). */
export function CotarFrete({ pedidoId, valor, className }: { pedidoId: string; valor: number; className?: string }) {
  const [texto, setTexto] = useState(valor > 0 ? valorParaInput(valor) : '')
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()

  function salvar(evento: FormEvent) {
    evento.preventDefault()
    iniciar(async () => {
      const r = await cotarFrete(pedidoId, texto)
      if (r.mensagem) avisar(r.mensagem, r.ok === false ? 'erro' : 'sucesso')
    })
  }

  return (
    <form onSubmit={salvar} className={cn('flex items-center gap-1.5', className)}>
      <div className="relative min-w-0 flex-1">
        <span className="tipo-dado pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[12px] text-suave">R$</span>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          aria-label="Valor do frete"
          className="tipo-dado h-9 w-full min-w-24 rounded-lg border border-linha bg-superficie pr-2 pl-8 text-[13px] outline-none focus:border-ink focus:ring-4 focus:ring-volt/25 lg:h-8"
        />
      </div>
      <Button type="submit" tamanho="sm" carregando={pendente} disabled={!texto.trim()}>
        <Check /> Salvar frete
      </Button>
    </form>
  )
}

/** Abre o WhatsApp do cliente com o frete cotado e o PIX. */
export function BotaoEnviarFrete({ href, className }: { href: string | null; className?: string }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classesBotao({ variante: 'whatsapp', tamanho: 'sm', className })}>
      <Send /> Enviar frete
    </a>
  )
}
