'use client'

import { Check, MessageCircle, Undo2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { ActionButton } from '@/components/ui/action-button'
import { Button, classesBotao, type TamanhoBotao } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { FORMAS_PAGAMENTO, STATUS_PEDIDO } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { StatusPagamento, StatusPedido } from '@/types'

import { definirPagamento, definirStatusPedido, registrarCobranca } from '../actions'

/**
 * Abre o WhatsApp com a mensagem de cobrança e, ao mesmo tempo, registra a
 * cobrança no CRM (o link abre direto no clique para não ser bloqueado).
 */
export function BotaoCobrar({
  pedidoId,
  href,
  tamanho = 'sm',
  rotulo = 'Cobrar',
  className,
}: {
  pedidoId: string
  href: string | null
  tamanho?: TamanhoBotao
  rotulo?: string
  className?: string
}) {
  const [, iniciar] = useTransition()
  const avisar = useAvisos()

  if (!href) {
    return (
      <Button tamanho={tamanho} disabled title="Cliente sem WhatsApp">
        <MessageCircle /> {rotulo}
      </Button>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={classesBotao({ variante: 'whatsapp', tamanho, className })}
      onClick={() =>
        iniciar(async () => {
          const r = await registrarCobranca(pedidoId)
          avisar(r.mensagem ?? 'Cobrança registrada.', r.ok === false ? 'erro' : 'sucesso')
        })
      }
    >
      <MessageCircle /> {rotulo}
    </a>
  )
}

/** Confirmação de pagamento com escolha da forma (PIX, dinheiro...). */
export function ControlePagamento({ pedidoId, status }: { pedidoId: string; status: StatusPagamento }) {
  const [forma, setForma] = useState('PIX')

  if (status === 'pago') {
    return (
      <ActionButton acao={definirPagamento.bind(null, pedidoId, 'pendente', undefined)} confirmar="Voltar o pagamento para pendente?">
        <Undo2 /> Desfazer pagamento
      </ActionButton>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={forma}
        onChange={(e) => setForma(e.target.value)}
        className="h-8 rounded-lg border border-linha bg-superficie px-2 text-[13px] font-medium"
        aria-label="Forma de pagamento"
      >
        {FORMAS_PAGAMENTO.map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      <ActionButton acao={definirPagamento.bind(null, pedidoId, 'pago', forma)} variante="primario">
        <Check /> Marcar como pago
      </ActionButton>
    </div>
  )
}

/** Atalho "Pago" para tabelas (forma PIX). */
export function BotaoPago({ pedidoId }: { pedidoId: string }) {
  return (
    <ActionButton acao={definirPagamento.bind(null, pedidoId, 'pago', 'PIX')} titulo="Marcar como pago (PIX)">
      <Check /> Pago
    </ActionButton>
  )
}

/** Avança o status operacional do pedido. */
export function SeletorStatus({ pedidoId, status }: { pedidoId: string; status: StatusPedido }) {
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()

  return (
    <select
      value={status}
      disabled={pendente}
      onChange={(e) => {
        const novo = e.target.value as StatusPedido
        if (novo === 'cancelado' && !window.confirm('Cancelar este pedido? Ele deixa de contar nas vendas e no estoque da pré-venda.')) return
        iniciar(async () => {
          const r = await definirStatusPedido(pedidoId, novo)
          if (r.mensagem) avisar(r.mensagem, r.ok === false ? 'erro' : 'sucesso')
        })
      }}
      className={cn('h-10 rounded-xl border border-linha bg-superficie px-3 text-sm font-semibold', pendente && 'opacity-60')}
      aria-label="Status do pedido"
    >
      {(Object.keys(STATUS_PEDIDO) as StatusPedido[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_PEDIDO[s].rotulo}
        </option>
      ))}
    </select>
  )
}
