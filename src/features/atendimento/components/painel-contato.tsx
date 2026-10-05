'use client'

import { BookUser, Crown, ExternalLink, RefreshCw, ShoppingBag, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition, type ReactNode } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input, Select, Textarea } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useAvisos } from '@/components/ui/toaster'
import { formatarData, formatarDataCurta, formatarMoeda, formatarWhatsapp, numeroPedido } from '@/lib/format'
import { STATUS_ATENDIMENTO, STATUS_PAGAMENTO } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { StatusAtendimento } from '@/types'

import { alterarStatusAtendimento, salvarComoLead, salvarContato, sincronizarConversaAgora, transferirAtendimento } from '../actions'
import type { Conversa, MembroEquipe } from '../queries'

function Secao({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-linha px-4 py-4', className)}>
      <h3 className="tipo-rotulo mb-2.5 text-suave">{titulo}</h3>
      {children}
    </section>
  )
}

const OPCOES_STATUS: StatusAtendimento[] = ['em_atendimento', 'aguardando_cliente', 'resolvido', 'fila']

export function PainelContato({
  conversa,
  equipe,
  pastas,
  pastaPadraoId,
}: {
  conversa: Conversa
  equipe: MembroEquipe[]
  pastas: Array<{ id: string; nome: string }>
  pastaPadraoId: string | null
}) {
  const { atendimento, contato, cliente, pedidos, lead, atendimentos } = conversa
  const id = atendimento.id!
  const aberto = atendimento.status !== 'resolvido'
  const nome = atendimento.contato_nome || formatarWhatsapp(contato.whatsapp) || 'Contato do WhatsApp'
  const nomes = new Map(equipe.map((m) => [m.id, m.nome]))
  const avisar = useAvisos()
  const [pendente, iniciar] = useTransition()
  const [pasta, setPasta] = useState(pastaPadraoId ?? pastas[0]?.id ?? '')

  const executar = (acao: () => Promise<{ ok?: boolean; mensagem?: string }>) =>
    iniciar(async () => {
      const r = await acao()
      if (r.mensagem) avisar(r.mensagem, r.ok === false ? 'erro' : 'sucesso')
    })

  return (
    <div className="pb-6">
      <div className="flex flex-col items-center px-4 pt-5 pb-4 text-center">
        <Avatar nome={nome} tamanho="lg" />
        <p className="mt-3 text-[16px] font-semibold break-words">{nome}</p>
        {contato.whatsapp ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="tipo-dado text-[13px] text-suave">{formatarWhatsapp(contato.whatsapp)}</span>
            <CopyButton texto={contato.whatsapp} rotulo="Copiar" variante="fantasma" />
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-sutil">Número oculto pelo WhatsApp</p>
        )}
        {contato.nome_whatsapp && contato.nome_whatsapp !== nome && (
          <p className="mt-0.5 text-[12px] text-sutil">No WhatsApp: {contato.nome_whatsapp}</p>
        )}
      </div>

      <Secao titulo={`Atendimento #${atendimento.numero}`}>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-suave">Responsável</span>
            <Select
              name="responsavel"
              value={atendimento.responsavel_id ?? ''}
              disabled={!aberto || pendente}
              onChange={(e) => e.target.value && executar(() => transferirAtendimento(id, e.target.value))}
              className="h-10 text-sm"
            >
              <option value="" disabled>
                {aberto ? 'Ninguém (na fila)' : '—'}
              </option>
              {equipe
                .filter((m) => m.ativo || m.id === atendimento.responsavel_id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
            </Select>
          </label>
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-suave">Status</span>
            <div className="grid grid-cols-2 gap-1.5">
              {OPCOES_STATUS.map((s) => {
                const atual = atendimento.status === s
                const reabrir = !aberto && s !== 'resolvido'
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={atual || pendente}
                    onClick={() => executar(() => alterarStatusAtendimento(id, s))}
                    className={cn(
                      'h-9 rounded-lg border px-2 text-[12px] font-semibold transition-colors disabled:cursor-default',
                      atual ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie text-ink hover:border-linha-forte hover:bg-papel',
                    )}
                    title={reabrir ? 'Reabrir o atendimento' : undefined}
                  >
                    {s === 'fila' ? 'Devolver à fila' : STATUS_ATENDIMENTO[s].rotulo}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Secao>

      <Secao titulo="Sobre o cliente">
        <ActionForm action={salvarContato.bind(null, contato.id)} className="space-y-3" mostrarSucesso={false} key={contato.id}>
          <Field label="Nome" name="nome">
            <Input name="nome" defaultValue={contato.nome ?? ''} placeholder={atendimento.contato_nome ?? 'Como chamar o cliente'} className="h-10 text-sm" />
          </Field>
          <Field label="Anotações" name="anotacoes" dica="Preferências, estilos favoritos… aparecem em todos os atendimentos.">
            <Textarea name="anotacoes" defaultValue={contato.anotacoes ?? ''} rows={4} placeholder="Ex.: gosta de IPA e Sour, retira na loja." className="text-sm" />
          </Field>
          <SubmitButton tamanho="sm" variante="secundario">Salvar</SubmitButton>
        </ActionForm>
      </Secao>

      <Secao titulo="Banco de Leads">
        {lead ? (
          <Link href={`/leads/listas/${lead.listaId}`} className="flex items-center gap-2 rounded-xl bg-papel px-3 py-2.5 text-sm hover:bg-ink/5">
            <BookUser className="size-4 shrink-0 text-volt-700" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {lead.pasta} › {lead.lista}
            </span>
            <ExternalLink className="size-3.5 text-sutil" aria-hidden />
          </Link>
        ) : !contato.whatsapp ? (
          <p className="text-[13px] text-suave">Sem número visível — não dá para salvar como lead.</p>
        ) : pastas.length === 0 ? (
          <p className="text-[13px] text-suave">
            Crie uma pasta no <Link href="/leads" className="font-semibold text-volt-700">Banco de Leads</Link> primeiro.
          </p>
        ) : (
          <div className="flex gap-2">
            <Select name="pasta" value={pasta} onChange={(e) => setPasta(e.target.value)} className="h-9 min-w-0 flex-1 text-sm">
              {pastas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
            <Button tamanho="sm" carregando={pendente} onClick={() => executar(() => salvarComoLead(contato.id, pasta || null))}>
              <BookUser /> Salvar
            </Button>
          </div>
        )}
      </Secao>

      <Secao titulo="Cliente do CRM">
        {cliente ? (
          <div className="space-y-3">
            <Link href={`/clientes/${cliente.id}`} className="flex items-center gap-2 text-sm font-semibold hover:text-volt-700">
              <UserRound className="size-4 text-sutil" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{cliente.nome}</span>
              {cliente.vip && (
                <Badge tom="vip">
                  <Crown className="size-3" aria-hidden /> VIP
                </Badge>
              )}
            </Link>
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-xl bg-papel px-3 py-2">
                <dt className="text-[11px] text-suave">Pedidos</dt>
                <dd className="tipo-dado font-semibold">{cliente.pedidos ?? 0}</dd>
              </div>
              <div className="rounded-xl bg-papel px-3 py-2">
                <dt className="text-[11px] text-suave">Total gasto</dt>
                <dd className="tipo-dado font-semibold">{formatarMoeda(cliente.total_gasto)}</dd>
              </div>
            </dl>
            {cliente.tags && cliente.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {cliente.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            )}
            {pedidos.length > 0 && (
              <ul className="space-y-1">
                {pedidos.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pedidos/${p.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] hover:bg-papel">
                      <ShoppingBag className="size-3.5 text-sutil" aria-hidden />
                      <span className="tipo-dado">{numeroPedido(p.numero)}</span>
                      <span className="text-sutil">{formatarDataCurta(p.criado_em)}</span>
                      <span className="tipo-dado ml-auto">{formatarMoeda(p.total)}</span>
                      {p.status_pagamento && <Badge tom={STATUS_PAGAMENTO[p.status_pagamento].tom}>{STATUS_PAGAMENTO[p.status_pagamento].rotulo}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-suave">Este número ainda não está no cadastro de clientes.</p>
        )}
      </Secao>

      <Secao titulo="Histórico de atendimentos">
        <ul className="space-y-1.5">
          {[...atendimentos].reverse().map((a) => (
            <li key={a.id} className={cn('flex items-center gap-2 text-[13px]', a.id === id && 'font-semibold')}>
              <span className="tipo-dado text-sutil">#{a.numero}</span>
              <span className="text-suave">{formatarData(a.criado_em)}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[12px] text-suave">{a.responsavel_id ? nomes.get(a.responsavel_id) : ''}</span>
              <Badge tom={STATUS_ATENDIMENTO[a.status].tom}>{STATUS_ATENDIMENTO[a.status].rotulo}</Badge>
            </li>
          ))}
        </ul>
      </Secao>

      <div className="px-4 pt-1">
        <ActionButton acao={() => sincronizarConversaAgora(contato.id)} className="w-full">
          <RefreshCw /> Sincronizar com o WhatsApp
        </ActionButton>
        <p className="mt-1.5 text-center text-[11px] text-sutil">Traz mensagens dos últimos 7 dias que não chegaram.</p>
      </div>
    </div>
  )
}
