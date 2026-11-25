'use client'

import { HandCoins, LayoutDashboard, LogOut, ShoppingBag, TicketPercent, UserRound, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

import { sairDoPortal } from '../actions'

/**
 * Moldura do Portal do influenciador: barra Ink no topo (marca da loja + menu no desktop)
 * e abas fixas embaixo no celular — é pelo celular que a maioria vai entrar.
 */

const SECOES: Array<{ href: string; rotulo: string; icone: LucideIcon }> = [
  { href: '/portal', rotulo: 'Início', icone: LayoutDashboard },
  { href: '/portal/vendas', rotulo: 'Vendas', icone: ShoppingBag },
  { href: '/portal/pagamentos', rotulo: 'Repasses', icone: HandCoins },
  { href: '/portal/conta', rotulo: 'Conta', icone: UserRound },
]

/** Marca do Portal: o nome da LOJA (é ela que o influenciador conhece), nunca o logotipo do CRM. */
export function MarcaDoPortal({ loja, clara = false }: { loja: string; clara?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt text-ink">
        <TicketPercent className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cn('block truncate text-[15px] leading-5 font-semibold', clara ? 'text-ink' : 'text-white')}>{loja}</span>
        <span className={cn('tipo-rotulo block text-[10px]', clara ? 'text-suave' : 'text-white/50')}>Portal de parceiros</span>
      </span>
    </span>
  )
}

export function CascaDoPortal({ loja, nome, children }: { loja: string; nome: string; children: ReactNode }) {
  const caminho = usePathname()
  const ativa = (href: string) => (href === '/portal' ? caminho === '/portal' : caminho.startsWith(href))

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-ink pt-[env(safe-area-inset-top)] print:hidden">
        <div className="mx-auto flex h-16 max-w-[1040px] items-center gap-4 px-4 sm:px-6">
          <Link href="/portal" className="min-w-0 shrink">
            <MarcaDoPortal loja={loja} />
          </Link>

          <nav aria-label="Seções" className="ml-4 hidden items-center gap-1 lg:flex">
            {SECOES.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                aria-current={ativa(s.href) ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  ativa(s.href) ? 'bg-ink-700 text-white' : 'text-white/60 hover:bg-ink-800 hover:text-white',
                )}
              >
                {s.rotulo}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/portal/conta" className="flex min-w-0 items-center gap-2 rounded-xl p-1 transition-colors hover:bg-ink-800" title="Minha conta">
              <Avatar nome={nome} variante="volt" tamanho="sm" />
              <span className="hidden max-w-[160px] truncate text-sm font-medium text-white sm:block">{nome.trim().split(/\s+/)[0]}</span>
            </Link>
            <form action={sairDoPortal}>
              <button type="submit" title="Sair" aria-label="Sair" className="grid size-9 place-items-center rounded-lg text-white/50 hover:bg-ink-700 hover:text-white">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1040px] px-4 pt-5 pb-[calc(64px+env(safe-area-inset-bottom)+24px)] sm:px-6 lg:pt-8 lg:pb-12">{children}</main>

      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
          {SECOES.map((s) => {
            const Icone = s.icone
            const selecionada = ativa(s.href)
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={selecionada ? 'page' : undefined}
                  className={cn('flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold', selecionada ? 'text-ink' : 'text-sutil')}
                >
                  <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', selecionada && 'bg-volt')}>
                    <Icone className="size-[18px]" aria-hidden />
                  </span>
                  {s.rotulo}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
