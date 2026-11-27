import { BellRing, CircleHelp, FlaskConical, MessageSquareText, TriangleAlert, type LucideIcon } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatarDataHora } from '@/lib/format'
import type { Tom } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

import { testarAlertaMercadoLivre } from '../actions'
import type { AlertaMlNaTela, EntregaAlertaMl } from '../queries'

const TIPOS: Record<AlertaMlNaTela['tipo'], { rotulo: string; icone: LucideIcon; chip: string }> = {
  pergunta: { rotulo: 'Pergunta', icone: CircleHelp, chip: 'bg-shopify-50 text-shopify-700' },
  mensagem: { rotulo: 'Mensagem', icone: MessageSquareText, chip: 'bg-vip-50 text-vip-700' },
  reclamacao: { rotulo: 'Reclamação', icone: TriangleAlert, chip: 'bg-alerta-50 text-alerta' },
  teste: { rotulo: 'Teste', icone: FlaskConical, chip: 'bg-ink/5 text-suave' },
}

const ENTREGA: Record<EntregaAlertaMl, { rotulo: string; tom: Tom }> = {
  aguardando: { rotulo: 'Aguardando envio', tom: 'neutro' },
  na_fila: { rotulo: 'Na fila para o n8n', tom: 'neutro' },
  tentando: { rotulo: 'n8n não respondeu · tentando de novo', tom: 'alerta' },
  entregue: { rotulo: 'Entregue ao n8n', tom: 'sucesso' },
  falhou: { rotulo: 'Falhou', tom: 'perigo' },
  sem_webhook: { rotulo: 'Sem webhook do n8n', tom: 'perigo' },
}

/** Alertas do Mercado Livre no grupo da equipe: o que avisa, teste e os últimos enviados. */
export function AlertasGrupoMercadoLivre({ alertas, conectado }: { alertas: AlertaMlNaTela[]; conectado: boolean }) {
  return (
    <Card>
      <CardHeader
        titulo="Alertas no grupo do WhatsApp"
        descricao="Pergunta nova, mensagem de comprador e reclamação no Mercado Livre viram um alerta no grupo da equipe (pelo n8n)."
        acoes={
          <ActionButton acao={testarAlertaMercadoLivre}>
            <BellRing /> Enviar alerta de teste
          </ActionButton>
        }
      />
      <CardContent className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-suave">
          <li>
            <strong className="text-ink">Pergunta</strong> em anúncio, assim que chega (só as ainda sem resposta).
          </li>
          <li>
            <strong className="text-ink">Mensagem</strong> de comprador no pós-venda, com a venda e os itens.
          </li>
          <li>
            <strong className="text-ink">Reclamação</strong>, devolução, troca ou cancelamento pelo comprador — com motivo e prazo — e de novo se
            for para mediação com o Mercado Livre.
          </li>
        </ul>
        {!conectado && (
          <p className="text-[13px] text-suave">Os alertas começam quando a conta do Mercado Livre estiver conectada. O teste já funciona.</p>
        )}
      </CardContent>
      {alertas.length > 0 ? (
        <ul className="divide-y divide-linha border-t border-linha">
          {alertas.map((a) => {
            const tipo = TIPOS[a.tipo]
            const Icone = tipo.icone
            const entrega = ENTREGA[a.entrega]
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-5">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tipo.chip)} aria-hidden>
                  <Icone className="size-4" />
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-[14px] leading-5 font-semibold">
                    {a.link ? (
                      <a href={a.link} target="_blank" rel="noreferrer" className="hover:underline">
                        {a.titulo}
                      </a>
                    ) : (
                      a.titulo
                    )}
                  </p>
                  <p className="tipo-dado mt-0.5 text-[11px] text-sutil">
                    {tipo.rotulo} · {formatarDataHora(a.criado_em)}
                  </p>
                </div>
                <span title={a.erroEntrega ?? undefined}>
                  <Badge tom={entrega.tom} ponto>
                    {entrega.rotulo}
                  </Badge>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="border-t border-linha px-4 py-6 text-center text-[13px] text-suave lg:px-5">
          Nenhum alerta ainda. Use “Enviar alerta de teste” para conferir se a mensagem chega no grupo.
        </p>
      )}
    </Card>
  )
}
