import { iniciais } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Avatar({
  nome,
  tamanho = 'md',
  variante = 'claro',
  className,
}: {
  nome: string | null | undefined
  tamanho?: 'sm' | 'md' | 'lg'
  variante?: 'claro' | 'volt'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-mono font-semibold',
        tamanho === 'sm' && 'size-8 text-[11px]',
        tamanho === 'md' && 'size-9 text-xs',
        tamanho === 'lg' && 'size-16 rounded-2xl text-xl',
        variante === 'claro' ? 'bg-papel text-ink ring-1 ring-linha' : 'bg-volt text-ink',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  )
}
