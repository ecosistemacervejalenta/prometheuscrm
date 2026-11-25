import { Lock } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Aviso discreto de privacidade (LGPD) com o link da política — no link da pré-venda e no /pagar. */
export function AvisoPrivacidade({ className, curto = false }: { className?: string; curto?: boolean }) {
  return (
    <p className={cn('flex items-start gap-2 text-[13px] leading-5 text-suave', curto && 'justify-center', className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {!curto && <>Usamos seus dados só para o seu pedido e a entrega. </>}
        <a href="/privacidade" target="_blank" rel="noopener" className="font-semibold underline underline-offset-2 hover:text-ink">
          Política de privacidade
        </a>
      </span>
    </p>
  )
}
