import Link from 'next/link'

import { formatarNumero, formatarPorcentagem } from '@/lib/format'

type PastaComEmails = { id: string | null; nome: string | null; leads: number | null; com_email: number | null }

/** Leads com e-mail: o total do banco (com medidor) e quantos há em cada pasta, do maior para o menor. */
export function ResumoEmails({ pastas }: { pastas: PastaComEmails[] }) {
  const totalLeads = pastas.reduce((s, p) => s + (p.leads ?? 0), 0)
  const totalEmails = pastas.reduce((s, p) => s + (p.com_email ?? 0), 0)
  const fracao = totalLeads ? totalEmails / totalLeads : 0
  const ordenadas = pastas.filter((p) => p.id).sort((a, b) => (b.com_email ?? 0) - (a.com_email ?? 0))
  const maior = ordenadas[0]?.com_email ?? 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
      <div>
        <p className="tipo-rotulo text-suave">Leads com e-mail</p>
        <p className="tipo-numero mt-1 text-[40px] leading-[44px]" style={{ fontVariantNumeric: 'proportional-nums' }}>
          {formatarNumero(totalEmails)}
        </p>
        <p className="mt-1 text-[13px] text-suave">
          {formatarPorcentagem(fracao)} dos {formatarNumero(totalLeads)} leads do banco
        </p>
        <div
          className="mt-4 h-2 max-w-md rounded-full bg-linha"
          role="meter"
          aria-label="Leads com e-mail"
          aria-valuemin={0}
          aria-valuemax={totalLeads}
          aria-valuenow={totalEmails}
        >
          <div className="h-full rounded-full bg-ink-600" style={{ width: `${fracao * 100}%` }} />
        </div>
      </div>

      <div className="min-w-0">
        <p className="tipo-rotulo mb-1 px-2 text-suave">Por pasta</p>
        <ul className="grid grid-cols-1 gap-0.5">
          {ordenadas.map((p) => {
            const emails = p.com_email ?? 0
            return (
              <li key={p.id}>
                <Link href={`/leads/pastas/${p.id}`} className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-papel">
                  <div className="flex items-baseline gap-2.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{p.nome}</span>
                    {emails > 0 ? (
                      <>
                        <span className="tipo-dado shrink-0 text-[13px] text-ink">{formatarNumero(emails)}</span>
                        <span className="tipo-dado w-[6.5rem] shrink-0 text-right text-[12px] text-suave">
                          {formatarPorcentagem(emails / (p.leads || 1))} da pasta
                        </span>
                      </>
                    ) : (
                      <span className="shrink-0 text-[12px] text-sutil">sem e-mail</span>
                    )}
                  </div>
                  {emails > 0 && (
                    <div className="mt-1 h-1.5" aria-hidden>
                      <div className="h-full rounded-full bg-ink-600" style={{ width: `max(3px, ${(emails / maior) * 100}%)` }} />
                    </div>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
