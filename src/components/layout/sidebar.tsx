'use client'

import {
  Beer,
  Building2,
  Crown,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { Icone, Logo } from '@/components/marca/marca'
import { Avatar } from '@/components/ui/avatar'
import { sair } from '@/features/auth/actions'
import { formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

type ItemMenu = {
  href: string
  rotulo: string
  icone: LucideIcon
  contagem?: number
  destaque?: number
}

export type PropsSidebar = {
  perfil: { nome: string; cargo: string | null; papel: string }
  contagens: { clientes: number; aReceber: number; preVendasAtivas: number }
  integracoes: Array<{ nome: string; status: string; ok: boolean; cor: string }>
}

function itensMenu(contagens: PropsSidebar['contagens']): ItemMenu[] {
  return [
    { href: '/', rotulo: 'Visão geral', icone: LayoutDashboard },
    { href: '/clientes', rotulo: 'Clientes', icone: Users, contagem: contagens.clientes },
    { href: '/pedidos', rotulo: 'Pedidos', icone: ShoppingBag, contagem: contagens.aReceber },
    { href: '/pre-vendas', rotulo: 'Pré-vendas', icone: Rocket, destaque: contagens.preVendasAtivas },
    { href: '/grupo-vip', rotulo: 'Grupo VIP', icone: Crown },
    { href: '/produtos', rotulo: 'Produtos', icone: Beer },
    { href: '/fornecedores', rotulo: 'Fornecedores', icone: Building2 },
    { href: '/contas', rotulo: 'Contas a pagar', icone: Wallet },
    { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
  ]
}

function Navegacao({ contagens, aoNavegar }: { contagens: PropsSidebar['contagens']; aoNavegar?: () => void }) {
  const caminho = usePathname()

  return (
    <nav aria-label="Menu principal">
      <p className="tipo-rotulo mb-2 px-3 text-white/40">Menu</p>
      <ul className="space-y-0.5">
        {itensMenu(contagens).map((item) => {
          const ativo = item.href === '/' ? caminho === '/' : caminho.startsWith(item.href)
          const Icon = item.icone
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={aoNavegar}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors',
                  ativo ? 'bg-ink-700 text-white' : 'text-white/70 hover:bg-ink-800 hover:text-white',
                )}
              >
                {ativo ? (
                  <span className="size-1.5 rounded-full bg-volt" aria-hidden />
                ) : (
                  <Icon className="size-4 text-white/40" aria-hidden />
                )}
                <span className="flex-1">{item.rotulo}</span>
                {item.destaque ? (
                  <span className="tipo-dado grid h-5 min-w-5 place-items-center rounded-md bg-volt px-1 text-[11px] text-ink">
                    {item.destaque}
                  </span>
                ) : item.contagem ? (
                  <span className="tipo-dado text-[11px] text-white/40">{formatarNumero(item.contagem)}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Integracoes({ integracoes }: { integracoes: PropsSidebar['integracoes'] }) {
  return (
    <Link href="/configuracoes/integracoes" className="mt-8 block rounded-xl px-3 py-2 hover:bg-ink-800">
      <p className="tipo-rotulo mb-2 text-white/40">Integrações</p>
      <ul className="space-y-1.5">
        {integracoes.map((i) => (
          <li key={i.nome} className="flex items-center gap-2 text-[13px] text-white/80">
            <span className="size-1.5 rounded-full" style={{ background: i.cor }} aria-hidden />
            <span className="flex-1">{i.nome}</span>
            <span className={cn('tipo-dado text-[11px]', i.ok ? 'text-volt' : 'text-white/35')}>{i.status}</span>
          </li>
        ))}
      </ul>
    </Link>
  )
}

function Usuario({ perfil }: { perfil: PropsSidebar['perfil'] }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/10 pt-4">
      <Avatar nome={perfil.nome} variante="volt" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{perfil.nome}</p>
        <p className="truncate text-[12px] text-white/50">
          {perfil.cargo ?? (perfil.papel === 'admin' ? 'Administrador' : 'Equipe')}
        </p>
      </div>
      <form action={sair}>
        <button
          type="submit"
          className="grid size-9 place-items-center rounded-lg text-white/50 hover:bg-ink-700 hover:text-white"
          title="Sair"
          aria-label="Sair"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  )
}

export function Sidebar({ perfil, contagens, integracoes }: PropsSidebar) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-ink px-4 py-6 lg:flex print:hidden">
        <Link href="/" className="mb-8 px-3">
          <Logo variante="negativa" largura={132} prioridade />
        </Link>
        <Navegacao contagens={contagens} />
        <Integracoes integracoes={integracoes} />
        <div className="mt-auto pt-6">
          <Usuario perfil={perfil} />
        </div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 lg:hidden print:hidden">
        <Link href="/" aria-label="Início">
          <Icone tamanho={30} />
        </Link>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="grid size-10 place-items-center rounded-lg text-white hover:bg-ink-700"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/60" onClick={() => setAberto(false)} aria-label="Fechar menu" />
          <div className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col overflow-y-auto bg-ink px-4 py-5">
            <div className="mb-6 flex items-center justify-between px-3">
              <Logo variante="negativa" largura={124} />
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-ink-700"
                aria-label="Fechar menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <Navegacao contagens={contagens} aoNavegar={() => setAberto(false)} />
            <Integracoes integracoes={integracoes} />
            <div className="mt-auto pt-6">
              <Usuario perfil={perfil} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
