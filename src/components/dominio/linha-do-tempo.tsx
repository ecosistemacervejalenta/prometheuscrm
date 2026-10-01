import { formatarDataCurta, formatarHora } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Atividade } from '@/types'

function corDoTipo(tipo: string) {
  if (tipo.startsWith('pagamento_pago')) return 'bg-sucesso'
  if (tipo.startsWith('cobranca')) return 'bg-shopify'
  if (tipo.startsWith('pedido')) return 'bg-volt'
  if (tipo.includes('cancelado') || tipo.includes('estornado')) return 'bg-perigo'
  if (tipo.startsWith('cliente') || tipo.startsWith('endereco')) return 'bg-app'
  return 'bg-vip'
}

/** Linha do tempo (atividades) — ficha do cliente e do pedido. */
export function LinhaDoTempo({ atividades, vazio = 'Nenhuma atividade ainda.' }: { atividades: Atividade[]; vazio?: string }) {
  if (atividades.length === 0) return <p className="text-sm text-suave">{vazio}</p>

  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-linha">
      {atividades.map((a) => (
        <li key={a.id} className="relative flex gap-4 pl-6">
          <span className={cn('absolute top-1.5 left-0 size-[11px] rounded-full ring-4 ring-superficie', corDoTipo(a.tipo))} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium">{a.descricao}</p>
            <p className="tipo-dado text-[12px] text-suave">
              {formatarDataCurta(a.criado_em)} · {formatarHora(a.criado_em)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
