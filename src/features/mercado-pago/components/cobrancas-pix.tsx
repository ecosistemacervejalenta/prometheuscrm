import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import type { Tom } from '@/lib/rotulos'

import type { CobrancaPix } from '../queries'

const SITUACAO: Record<string, { rotulo: string; tom: Tom }> = {
  criando: { rotulo: 'Gerando', tom: 'neutro' },
  pendente: { rotulo: 'Aguardando', tom: 'alerta' },
  pago: { rotulo: 'Pago', tom: 'sucesso' },
  expirado: { rotulo: 'Expirou', tom: 'neutro' },
  cancelado: { rotulo: 'Cancelado', tom: 'neutro' },
  recusado: { rotulo: 'Recusado', tom: 'perigo' },
  estornado: { rotulo: 'Devolvido', tom: 'perigo' },
  erro: { rotulo: 'Erro', tom: 'perigo' },
}

/** PIX do Mercado Pago de um pedido + link de pagamento para mandar ao cliente. */
export function CobrancasPix({ cobrancas, linkPagamento }: { cobrancas: CobrancaPix[]; linkPagamento: string | null }) {
  if (!cobrancas.length && !linkPagamento) return null
  return (
    <div className="mt-4 space-y-3 border-t border-linha pt-4">
      {linkPagamento && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-papel p-3">
          <div className="min-w-0">
            <p className="tipo-rotulo text-suave">Link de pagamento (PIX Mercado Pago)</p>
            <p className="tipo-dado truncate text-[13px]">{linkPagamento}</p>
          </div>
          <CopyButton texto={linkPagamento} rotulo="Copiar link" />
        </div>
      )}
      {cobrancas.length > 0 && (
        <ul className="divide-y divide-linha rounded-xl border border-linha text-[14px]">
          {cobrancas.map((c) => {
            const s = SITUACAO[c.status] ?? { rotulo: c.status, tom: 'neutro' as Tom }
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="tipo-dado font-semibold">PIX {formatarMoeda(c.valor_pago ?? c.valor)}</p>
                  <p className="text-[12px] text-suave">
                    {c.status === 'pago' && c.pago_em
                      ? `Pago em ${formatarDataHora(c.pago_em)}`
                      : c.status === 'pendente' && c.expira_em
                        ? `Gerado em ${formatarDataHora(c.criado_em)} · vale até ${formatarDataHora(c.expira_em)}`
                        : `Gerado em ${formatarDataHora(c.criado_em)}`}
                    {c.mp_pagamento_id && ` · MP ${c.mp_pagamento_id}`}
                  </p>
                  {c.status === 'erro' && c.detalhe && <p className="text-[12px] text-perigo">{c.detalhe}</p>}
                </div>
                <Badge tom={s.tom} ponto>
                  {s.rotulo}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
