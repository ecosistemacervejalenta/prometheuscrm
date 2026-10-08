import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

import { CORES_ETIQUETA, type CorEtiqueta, type Etiqueta } from '../schema'

/** Classes literais (o Tailwind só gera as que aparecem no código). */
export const FUNDO_ETIQUETA: Record<CorEtiqueta, string> = {
  vermelho: 'bg-etiqueta-vermelho',
  laranja: 'bg-etiqueta-laranja',
  amarelo: 'bg-etiqueta-amarelo',
  verde: 'bg-etiqueta-verde',
  azul: 'bg-etiqueta-azul',
  roxo: 'bg-etiqueta-roxo',
  rosa: 'bg-etiqueta-rosa',
  cinza: 'bg-etiqueta-cinza',
}

const NOMES_CORES: Record<CorEtiqueta, string> = {
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  roxo: 'Roxo',
  rosa: 'Rosa',
  cinza: 'Cinza',
}

/** Primeira cor ainda sem etiqueta (para a próxima não repetir a cor de outra). */
export function corSugerida(etiquetas: Etiqueta[]): CorEtiqueta {
  return CORES_ETIQUETA.find((cor) => !etiquetas.some((e) => e.cor === cor)) ?? CORES_ETIQUETA[etiquetas.length % CORES_ETIQUETA.length]
}

/** Etiqueta com fundo cheio na cor escolhida — identificável de relance na lista. */
export function EtiquetaChip({
  etiqueta,
  tamanho = 'sm',
  aoRemover,
  className,
}: {
  etiqueta: Etiqueta
  tamanho?: 'sm' | 'md'
  aoRemover?: () => void
  className?: string
}) {
  return (
    <span
      title={etiqueta.nome}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-md font-semibold',
        tamanho === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-[12px]',
        FUNDO_ETIQUETA[etiqueta.cor] ?? FUNDO_ETIQUETA.cinza,
        etiqueta.cor === 'amarelo' ? 'text-ink escuro:text-ink-900' : 'text-white',
        className,
      )}
    >
      <span className="truncate">{etiqueta.nome}</span>
      {aoRemover && (
        <button
          type="button"
          onClick={aoRemover}
          className="-mr-1 grid size-4 shrink-0 place-items-center rounded opacity-75 transition hover:bg-ink/15 hover:opacity-100"
          aria-label={`Tirar a etiqueta ${etiqueta.nome}`}
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  )
}

/** Bolinhas de cor (rádio). Com `valor` é controlado; sem, usa `padrao` (formulários). */
export function SeletorCor({
  name = 'cor',
  valor,
  padrao,
  aoMudar,
}: {
  name?: string
  valor?: CorEtiqueta
  padrao?: CorEtiqueta
  aoMudar?: (cor: CorEtiqueta) => void
}) {
  return (
    <div role="radiogroup" aria-label="Cor da etiqueta" className="flex flex-wrap gap-2">
      {CORES_ETIQUETA.map((cor) => (
        <label key={cor} title={NOMES_CORES[cor]} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={cor}
            className="peer sr-only"
            {...(valor !== undefined ? { checked: valor === cor, onChange: () => aoMudar?.(cor) } : { defaultChecked: padrao === cor })}
          />
          <span
            className={cn(
              'block size-6 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-superficie transition',
              'peer-checked:ring-ink peer-focus-visible:ring-volt',
              FUNDO_ETIQUETA[cor],
            )}
          />
          <span className="sr-only">{NOMES_CORES[cor]}</span>
        </label>
      ))}
    </div>
  )
}
