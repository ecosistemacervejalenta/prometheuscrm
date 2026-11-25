import Link from 'next/link'
import { BellRing, CircleAlert, CircleCheck, CircleX, Clock, RotateCw, TriangleAlert, type LucideIcon } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import type { Tom } from '@/lib/rotulos'
import { formatarData, formatarDataHora } from '@/lib/format'
import { cn } from '@/lib/utils'

import { reenviarAviso } from '../actions-avisos'
import type { AvisoDoLote, EntregaDoAviso } from '../queries'

/** Rótulo, tom e ícone de cada faixa do aviso (mesmas cores do painel de validades). */
export const FAIXA_DO_AVISO: Record<AvisoDoLote['faixa'], { rotulo: string; descricao: string; tom: Tom; icone: LucideIcon; chip: string }> = {
  alerta: { rotulo: 'Alerta', descricao: '16 a 30 dias', tom: 'shopify', icone: Clock, chip: 'bg-shopify-50 text-shopify-700' },
  atencao: { rotulo: 'Atenção', descricao: '8 a 15 dias', tom: 'vip', icone: CircleAlert, chip: 'bg-vip-50 text-vip-700' },
  critico: { rotulo: 'Crítico', descricao: 'até 7 dias', tom: 'alerta', icone: TriangleAlert, chip: 'bg-alerta-50 text-alerta' },
}

const ENTREGA: Record<EntregaDoAviso, { rotulo: string; tom: Tom }> = {
  aguardando: { rotulo: 'Aguardando envio', tom: 'neutro' },
  na_fila: { rotulo: 'Na fila para o n8n', tom: 'neutro' },
  tentando: { rotulo: 'n8n não respondeu · tentando de novo', tom: 'alerta' },
  entregue: { rotulo: 'Entregue ao n8n', tom: 'sucesso' },
  falhou: { rotulo: 'Falhou', tom: 'perigo' },
  sem_webhook: { rotulo: 'Sem webhook do n8n', tom: 'perigo' },
}

export function SeloEntrega({ aviso }: { aviso: AvisoDoLote }) {
  const { rotulo, tom } = ENTREGA[aviso.entrega]
  return (
    <span title={aviso.erroEntrega ?? undefined}>
      <Badge tom={tom} ponto>
        {rotulo}
      </Badge>
    </span>
  )
}

const dias = (n: number) => (n <= 0 ? (n === 0 ? 'vencia hoje' : 'já vencido') : n === 1 ? 'vencia amanhã' : `vencia em ${n} dias`)

/** Lista dos avisos mandados ao grupo, com a entrega ao n8n e a tratativa de cada um. */
export function ListaAvisos({ avisos }: { avisos: AvisoDoLote[] }) {
  if (avisos.length === 0) {
    return (
      <p className="border-t border-linha px-4 py-8 text-center text-sm text-suave lg:px-5">
        Nenhum aviso ainda. Use “Enviar mensagem de teste” para conferir se a mensagem chega no grupo.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-linha border-t border-linha">
      {avisos.map((a) => {
        const faixa = FAIXA_DO_AVISO[a.faixa]
        const Icone = faixa.icone
        const ultima = a.tratativas.at(-1)
        const podeReenviar = a.entrega === 'falhou' || a.entrega === 'sem_webhook' || a.entrega === 'tentando'
        return (
          <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3 lg:px-5">
            <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', faixa.chip)} aria-hidden>
              <Icone className="size-4" />
            </span>
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-[14px] leading-5 font-semibold">
                {a.cerveja_nome} <span className="tipo-dado font-medium text-suave">· lote {a.lote}</span>
                {a.teste && (
                  <Badge className="ml-2 align-middle" tom="neutro">
                    Teste
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-[13px] text-suave">
                {faixa.rotulo} · {dias(a.dias)} · validade {formatarData(a.validade)}
              </p>
              <p className="tipo-dado mt-1 text-[11px] text-sutil">Aviso de {formatarDataHora(a.criado_em)}</p>
              {ultima ? (
                <p className="mt-2 rounded-lg bg-sucesso-50 px-3 py-2 text-[13px] leading-[18px] text-ink/80">
                  <CircleCheck className="mr-1 inline size-3.5 text-sucesso" aria-hidden />
                  <strong>Tratado por {ultima.autor ?? 'equipe'}</strong> em {formatarDataHora(ultima.criado_em)}: {ultima.texto}
                  {a.tratativas.length > 1 && <span className="text-suave"> (+{a.tratativas.length - 1})</span>}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <SeloEntrega aviso={a} />
              {podeReenviar && (
                <ActionButton acao={reenviarAviso.bind(null, a.id)} titulo="Mandar de novo ao n8n">
                  <RotateCw /> Reenviar
                </ActionButton>
              )}
              <ButtonLink href={`/lotes/tratativa/${a.id}`} tamanho="sm" variante={ultima ? 'secundario' : 'escuro'}>
                {ultima ? 'Ver tratativa' : 'Registrar tratativa'}
              </ButtonLink>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Linha curta no lote (tela da cerveja): avisado no grupo e tratado ou não. */
export function SituacaoDoAviso({ aviso }: { aviso: AvisoDoLote }) {
  const faixa = FAIXA_DO_AVISO[aviso.faixa]
  const ultima = aviso.tratativas.at(-1)
  return (
    <Link
      href={`/lotes/tratativa/${aviso.id}`}
      className={cn('mt-1 inline-flex items-center gap-1 text-[12px] font-medium hover:underline', ultima ? 'text-sucesso' : 'text-alerta')}
    >
      {ultima ? <CircleCheck className="size-3.5" aria-hidden /> : <BellRing className="size-3.5" aria-hidden />}
      {ultima
        ? `Tratado por ${ultima.autor ?? 'equipe'} em ${formatarDataHora(ultima.criado_em)}`
        : `Avisado no grupo (${faixa.rotulo}) · registrar tratativa`}
    </Link>
  )
}

export function EntregaComErro({ aviso }: { aviso: AvisoDoLote }) {
  if (!aviso.erroEntrega || aviso.entrega === 'entregue') return null
  return (
    <p className="mt-2 flex items-start gap-1.5 text-[12px] text-perigo">
      <CircleX className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {aviso.erroEntrega}
    </p>
  )
}
