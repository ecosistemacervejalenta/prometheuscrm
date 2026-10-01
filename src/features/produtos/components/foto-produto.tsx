import { Beer } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Miniatura do produto (imagem do Storage ou ícone). */
export function FotoProduto({ url, nome, className }: { url: string | null | undefined; nome: string; className?: string }) {
  return (
    <span className={cn('grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-volt-50 text-volt-700', className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagens públicas do Supabase Storage
        <img src={url} alt={nome} className="size-full object-cover" loading="lazy" />
      ) : (
        <Beer className="size-1/2" aria-hidden />
      )}
    </span>
  )
}
