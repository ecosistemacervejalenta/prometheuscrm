'use client'

import {
  Beer,
  BookUser,
  Building2,
  ChevronRight,
  Crown,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Rocket,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Icone } from '@/components/marca/marca'
import { Avatar } from '@/components/ui/avatar'
import { sair } from '@/features/auth/actions'
import { formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { PropsSidebar } from './sidebar'

/**
 * Navegação mobile (< 1024px) no padrão de app iOS:
 * - barra superior translúcida, com o título da seção aparecendo ao rolar;
 * - barra de abas inferior (respeita a safe area do iPhone);
 * - folha "Mais" que sobe de baixo com as demais seções.
 */

type Aba = { href: string; rotulo: string; icone: LucideIcon }

const ABAS: Aba[] = [
  { href: '/', rotulo: 'Início', icone: LayoutDashboard },
  { href: '/atendimento', rotulo: 'Atendimento', icone: MessagesSquare },
  { href: '/clientes', rotulo: 'Clientes', icone: Users },
  { href: '/pre-vendas', rotulo: 'Pré-vendas', icone: Rocket },
]

type ItemMais = { href: string; rotulo: string; icone: LucideIcon; cor: string; contagem?: number }

const TITULOS: Array<[string, string]> = [
  ['/atendimento', 'Atendimento'],
  ['/clientes', 'Clientes'],
  ['/leads', 'Banco de Leads'],
  ['/pedidos', 'Pedidos'],
  ['/pre-vendas', 'Pré-vendas'],
  ['/grupo-vip', 'Grupo VIP'],
  ['/produtos', 'Produtos'],
  ['/fornecedores', 'Fornecedores'],
  ['/contas', 'Contas a pagar'],
  ['/receber', 'Contas a receber'],
  ['/configuracoes', 'Configurações'],
]

function ativo(caminho: string, href: string) {
  return href === '/' ? caminho === '/' : caminho.startsWith(href)
}

export function MobileNav({ perfil, contagens }: PropsSidebar) {
  const caminho = usePathname()
  const [maisAberto, setMaisAberto] = useState(false)
  const [rolou, setRolou] = useState(false)

  const itensMais: ItemMais[] = [
    { href: '/pedidos', rotulo: 'Pedidos', icone: ShoppingBag, cor: '#2a78d6', contagem: contagens.aReceber },
    { href: '/grupo-vip', rotulo: 'Grupo VIP', icone: Crown, cor: '#c8930a' },
    { href: '/leads', rotulo: 'Banco de Leads', icone: BookUser, cor: '#0f8a8a' },
    { href: '/produtos', rotulo: 'Produtos', icone: Beer, cor: '#eda100' },
    { href: '/fornecedores', rotulo: 'Fornecedores', icone: Building2, cor: '#4a3aa7' },
    { href: '/contas', rotulo: 'Contas a pagar', icone: Wallet, cor: '#1baf7a' },
    { href: '/receber', rotulo: 'Contas a receber', icone: HandCoins, cor: '#d6455d' },
    { href: '/configuracoes', rotulo: 'Configurações', icone: Settings, cor: '#6b7280' },
  ]
  const maisAtivo = itensMais.some((i) => ativo(caminho, i.href))
  const titulo = caminho === '/' ? 'Visão geral' : (TITULOS.find(([p]) => caminho.startsWith(p))?.[1] ?? 'Prometheus')

  // Título compacto aparece quando o título grande da página sai da tela (padrão iOS).
  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 56)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [caminho])

  // Folha aberta: trava a rolagem do fundo e fecha com Esc.
  useEffect(() => {
    if (!maisAberto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMaisAberto(false)
    window.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = anterior
      window.removeEventListener('keydown', aoTeclar)
    }
  }, [maisAberto])

  return (
    <>
      {/* Barra superior */}
      <header
        className={cn(
          'sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-colors lg:hidden print:hidden',
          rolou ? 'border-b border-linha/80 bg-papel/92 backdrop-blur-xl backdrop-saturate-150' : 'bg-papel',
        )}
      >
        <div className="relative flex h-12 items-center justify-between px-4">
          <Link href="/" aria-label="Início" className="-m-2 p-2">
            <Icone tamanho={28} />
          </Link>
          <p
            className={cn(
              'pointer-events-none absolute inset-x-16 truncate text-center text-[17px] font-semibold transition-opacity duration-200',
              rolou ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden={!rolou}
          >
            {titulo}
          </p>
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className="-m-1.5 rounded-full p-1.5 active:opacity-60"
            aria-label="Abrir perfil e menu"
          >
            <Avatar nome={perfil.nome} tamanho="sm" variante="volt" />
          </button>
        </div>
      </header>

      {/* Barra de abas */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-linha/80 bg-superficie/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden print:hidden"
      >
        <ul className="mx-auto grid h-[var(--altura-abas)] max-w-xl grid-cols-5">
          {ABAS.map((aba) => (
            <li key={aba.href}>
              <ItemAba
                href={aba.href}
                rotulo={aba.rotulo}
                icone={aba.icone}
                ativo={ativo(caminho, aba.href)}
                selo={aba.href === '/pre-vendas' ? contagens.preVendasAtivas : aba.href === '/atendimento' ? contagens.atendimentos : undefined}
              />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMaisAberto(true)}
              className="flex h-full w-full flex-col items-center justify-center gap-1"
              aria-haspopup="dialog"
              aria-expanded={maisAberto}
            >
              <IconeAba ativo={maisAtivo} icone={null} />
              <span className={cn('text-[10.5px] leading-none font-semibold', maisAtivo ? 'text-ink' : 'text-suave')}>Mais</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* Folha "Mais" */}
      {maisAberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            className="animar-fundo absolute inset-0 bg-ink/40"
            onClick={() => setMaisAberto(false)}
            aria-label="Fechar menu"
          />
          <div className="animar-folha absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[28px] bg-papel px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-flutuante">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-linha-forte" aria-hidden />

            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-superficie p-4">
              <Avatar nome={perfil.nome} tamanho="md" variante="volt" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{perfil.nome}</p>
                <p className="truncate text-[13px] text-suave">
                  {perfil.cargo ?? (perfil.papel === 'admin' ? 'Administrador' : 'Equipe')}
                </p>
              </div>
            </div>

            <ul className="overflow-hidden rounded-2xl bg-superficie">
              {itensMais.map((item) => {
                const Icon = item.icone
                return (
                  <li key={item.href} className="border-b border-linha last:border-b-0">
                    <Link
                      href={item.href}
                      onClick={() => setMaisAberto(false)}
                      className="flex min-h-[52px] items-center gap-3 px-4 active:bg-papel"
                    >
                      <span className="grid size-8 place-items-center rounded-[9px] text-white" style={{ background: item.cor }}>
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="flex-1 text-[16px] font-medium">{item.rotulo}</span>
                      {item.contagem ? (
                        <span className="tipo-dado rounded-full bg-papel px-2 py-0.5 text-[12px] text-suave">
                          {formatarNumero(item.contagem)}
                        </span>
                      ) : null}
                      <ChevronRight className="size-4 text-sutil" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>

            <form action={sair} className="mt-5">
              <button
                type="submit"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-superficie text-[16px] font-semibold text-perigo active:bg-perigo-50"
              >
                <LogOut className="size-4" aria-hidden /> Sair
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function IconeAba({ ativo, icone: Icon }: { ativo: boolean; icone: LucideIcon | null }) {
  return (
    <span
      className={cn(
        'grid h-7 w-14 place-items-center rounded-full transition-colors',
        ativo ? 'bg-ink text-white' : 'text-suave',
      )}
      aria-hidden
    >
      {Icon ? (
        <Icon className="size-[20px]" strokeWidth={ativo ? 2.2 : 1.8} />
      ) : (
        <span className="flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn('size-[5px] rounded-full', ativo ? 'bg-white' : 'bg-suave')} />
          ))}
        </span>
      )}
    </span>
  )
}

function ItemAba({
  href,
  rotulo,
  icone,
  ativo,
  selo,
}: {
  href: string
  rotulo: string
  icone: LucideIcon
  ativo: boolean
  selo?: number
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      className="relative flex h-full flex-col items-center justify-center gap-1"
    >
      <IconeAba ativo={ativo} icone={icone} />
      {selo ? (
        <span className="tipo-dado absolute top-1.5 left-1/2 ml-3 grid h-4 min-w-4 place-items-center rounded-full bg-volt px-1 text-[10px] leading-none text-ink ring-2 ring-superficie">
          {selo}
        </span>
      ) : null}
      <span className={cn('text-[10.5px] leading-none font-semibold', ativo ? 'text-ink' : 'text-suave')}>{rotulo}</span>
    </Link>
  )
}
