import Link from 'next/link'
import { CircleAlert, CircleCheck, CircleX, Clock, Package, TriangleAlert, type LucideIcon } from 'lucide-react'

import { formatarNumero, formatarPorcentagem } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ContagemLotes, FiltroLotes, ResumoDosLotes } from '../queries'
import { SITUACOES_VALIDADE, type SituacaoValidade } from '../validade'

/** Ícone e cores de cada faixa (as mesmas cores de estado dos selos do CRM; nunca só a cor: sempre com ícone e nome). */
const VISUAL: Record<SituacaoValidade, { icone: LucideIcon; chip: string; barra: string }> = {
  vencido: { icone: CircleX, chip: 'bg-perigo-50 text-perigo', barra: 'bg-perigo' },
  critico: { icone: TriangleAlert, chip: 'bg-alerta-50 text-alerta', barra: 'bg-alerta' },
  atencao: { icone: CircleAlert, chip: 'bg-vip-50 text-vip-700', barra: 'bg-vip' },
  alerta: { icone: Clock, chip: 'bg-shopify-50 text-shopify-700', barra: 'bg-shopify' },
  ok: { icone: CircleCheck, chip: 'bg-sucesso-50 text-sucesso', barra: 'bg-sucesso' },
}

const quantos = (n: number) => `${formatarNumero(n)} lote${n === 1 ? '' : 's'}`

function Cartao({
  href,
  ativo,
  icone: Icone,
  chip,
  rotulo,
  faixa,
  contagem,
  fatia,
}: {
  href: string
  ativo: boolean
  icone: LucideIcon
  chip: string
  rotulo: string
  faixa: string
  contagem: ContagemLotes
  /** Parte do total de lotes ("31%"), nos cartões das faixas. */
  fatia?: string
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativo ? 'true' : undefined}
      title={`Ver na lista: ${rotulo.toLowerCase()}`}
      className={cn(
        'flex min-w-0 flex-col rounded-cartao border bg-superficie p-3.5 shadow-cartao transition-colors sm:p-4',
        ativo ? 'border-ink ring-1 ring-ink' : 'border-linha hover:border-linha-forte',
      )}
    >
      {/* No celular o número fica ao lado do ícone (cartão mais baixo); do tablet em diante, embaixo. */}
      <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
        <span className={cn('col-start-1 row-start-1 grid size-9 shrink-0 place-items-center rounded-xl', chip)}>
          <Icone className="size-[18px]" aria-hidden />
        </span>
        <span
          className={cn(
            'tipo-numero col-start-2 row-start-1 truncate text-[26px] leading-9 sm:col-span-3 sm:col-start-1 sm:row-start-2 sm:mt-3 sm:text-[30px]',
            contagem.lotes === 0 && 'text-sutil',
          )}
        >
          {formatarNumero(contagem.lotes)}
        </span>
        {fatia && <span className="tipo-dado col-start-3 row-start-1 text-[12px] text-suave">{fatia}</span>}
      </span>
      <span className="mt-2 truncate text-sm font-semibold sm:mt-0.5">{rotulo}</span>
      <span className="truncate text-[12px] leading-[18px] text-suave">{faixa}</span>
      <span className="tipo-dado mt-2 truncate border-t border-linha pt-2 text-[12px] text-suave">{formatarNumero(contagem.unidades)} un.</span>
    </Link>
  )
}

/**
 * Painel do módulo: quantos lotes (e unidades) há no total e em cada faixa de validade.
 * Cada cartão filtra a lista de baixo; a barra mostra a proporção das faixas no total.
 */
export function PainelValidades({ resumo, filtro, busca }: { resumo: ResumoDosLotes; filtro: FiltroLotes | undefined; busca: string | undefined }) {
  const { total, porSituacao } = resumo
  const href = (situacao?: SituacaoValidade) => {
    const params = new URLSearchParams()
    if (busca) params.set('q', busca)
    if (situacao) params.set('situacao', situacao)
    return params.size ? `/lotes?${params}` : '/lotes'
  }
  const fatia = (lotes: number) => (total.lotes ? formatarPorcentagem(lotes / total.lotes) : undefined)
  const comLotes = SITUACOES_VALIDADE.filter((s) => porSituacao[s.chave].lotes > 0)

  return (
    <section aria-label="Painel de validades" className="mb-4 lg:mb-6">
      {comLotes.length > 0 && (
        <div
          role="img"
          aria-label={`Lotes por validade: ${comLotes.map((s) => `${s.rotulo.toLowerCase()} ${porSituacao[s.chave].lotes}`).join(', ')}`}
          className="mb-3 flex h-2 gap-0.5"
        >
          {comLotes.map((s) => (
            <span
              key={s.chave}
              title={`${s.rotulo} (${s.faixa.toLowerCase()}): ${quantos(porSituacao[s.chave].lotes)} · ${fatia(porSituacao[s.chave].lotes)}`}
              style={{ flexGrow: porSituacao[s.chave].lotes }}
              className={cn('min-w-2 basis-0 rounded-full', VISUAL[s.chave].barra)}
            />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Cartao
          href={href()}
          ativo={filtro === undefined}
          icone={Package}
          chip="bg-ink text-white escuro:bg-ink-600"
          rotulo="Total"
          faixa="Todos os lotes"
          contagem={total}
        />
        {SITUACOES_VALIDADE.map((s) => (
          <Cartao
            key={s.chave}
            href={href(s.chave)}
            ativo={filtro === s.chave}
            icone={VISUAL[s.chave].icone}
            chip={VISUAL[s.chave].chip}
            rotulo={s.rotulo}
            faixa={s.faixa}
            contagem={porSituacao[s.chave]}
            fatia={fatia(porSituacao[s.chave].lotes)}
          />
        ))}
      </div>
    </section>
  )
}
