import { formatarNumero } from '@/lib/format'

import { REGIAO_DO_DDD, resumirDdds, type ContagemDdd } from '../ddd'
import { ExportarNumeros } from './exportar-numeros'

/** Quantos números a pasta ou lista tem no DDD escolhido (ou ao todo), com os botões de exportar. */
export function ResumoDdd({
  contagem,
  ddd,
  onde,
  nome,
  pastaId,
  listaId,
}: {
  contagem: ContagemDdd[]
  ddd?: string
  onde: 'pasta' | 'lista'
  nome: string
  pastaId?: string
  listaId?: string
}) {
  const { total, semDdd, porDdd } = resumirDdds(contagem)
  const numeros = ddd ? (porDdd.find((d) => d.ddd === ddd)?.numeros ?? 0) : total
  const fatia = total ? (numeros / total) * 100 : 0
  const percentual = fatia > 0 && fatia < 1 ? 'menos de 1' : String(Math.round(fatia))
  const nesta = onde === 'pasta' ? 'nesta pasta' : 'nesta lista'

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between lg:px-5">
      <div className="min-w-0">
        <p className="tipo-rotulo text-suave">{ddd ? `DDD ${ddd} · ${REGIAO_DO_DDD[ddd]}` : 'Todos os DDDs'}</p>
        <p className="tipo-numero mt-1 text-[28px] leading-8 lg:text-[32px] lg:leading-9">{formatarNumero(numeros)}</p>
        <p className="mt-1 text-[13px] text-suave">
          {ddd
            ? `número(s) com DDD ${ddd} ${nesta} · ${percentual}% dos ${formatarNumero(total)} com WhatsApp`
            : `número(s) com WhatsApp ${nesta}`}
          {onde === 'pasta' && ' · sem repetir'}
        </p>
        {!ddd && semDdd > 0 && (
          <p className="mt-0.5 text-[12px] text-sutil">{formatarNumero(semDdd)} sem DDD do Brasil (estrangeiros ou inválidos)</p>
        )}
      </div>
      <ExportarNumeros pastaId={pastaId} listaId={listaId} ddd={ddd ?? null} total={numeros} nome={nome} />
    </div>
  )
}
