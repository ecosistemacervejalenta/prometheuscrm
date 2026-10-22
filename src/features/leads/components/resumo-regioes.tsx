import { formatarNumero, formatarPorcentagem } from '@/lib/format'

import { somarRegioes } from '../ddd'

/** WhatsApp por região do Brasil: número, fatia do total e um medidor (0–100%) para cada uma. */
export function ResumoRegioes({ porDdd }: { porDdd: Array<{ ddd: string; numeros: number }> }) {
  const regioes = somarRegioes(porDdd)
  const total = regioes.reduce((s, r) => s + r.numeros, 0)
  if (!total) return null

  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5" aria-label="WhatsApp por região">
      {regioes.map((r) => {
        const fracao = r.numeros / total
        return (
          <li key={r.regiao} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-ink">{r.regiao}</span>
              <span className="tipo-dado shrink-0 text-[12px] text-suave">{formatarPorcentagem(fracao)}</span>
            </div>
            <p className="tipo-dado mt-0.5 text-[15px] text-ink">{formatarNumero(r.numeros)}</p>
            <div
              className="mt-1.5 h-1.5 rounded-full bg-linha"
              role="meter"
              aria-label={`${r.regiao}: ${formatarPorcentagem(fracao)} dos números`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={r.numeros}
            >
              {r.numeros > 0 && (
                <div className="h-full rounded-full bg-whatsapp-700" style={{ width: `max(3px, ${fracao * 100}%)` }} />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
