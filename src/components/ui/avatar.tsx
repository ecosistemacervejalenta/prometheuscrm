import { iniciais } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Iniciais da pessoa ou, se houver, a foto de perfil — sempre num círculo.
 * A foto fica por cima das iniciais: se não carregar, as iniciais aparecem.
 */
export function Avatar({
  nome,
  foto,
  tamanho = 'md',
  variante = 'claro',
  className,
}: {
  nome: string | null | undefined
  foto?: string | null
  tamanho?: 'sm' | 'md' | 'lg' | 'xl'
  variante?: 'claro' | 'volt'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full font-mono font-semibold',
        tamanho === 'sm' && 'size-8 text-[11px]',
        tamanho === 'md' && 'size-9 text-xs',
        tamanho === 'lg' && 'size-16 text-xl',
        tamanho === 'lg' && !foto && 'rounded-2xl',
        tamanho === 'xl' && 'size-24 text-3xl',
        variante === 'claro' ? 'bg-papel text-ink ring-1 ring-linha' : 'bg-volt text-ink escuro:text-ink-900',
        // Com foto, o fundo recua 1px: a borda do círculo fica só com a foto, sem fio colorido.
        foto && 'bg-clip-content p-px',
        className,
      )}
    >
      {iniciais(nome)}
      {foto && (
        <span
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${JSON.stringify(foto)})` }}
        />
      )}
    </span>
  )
}
