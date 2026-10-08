'use client'

import { Moon, Sun } from 'lucide-react'
import { createContext, use, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { COOKIE_TEMA_ATENDIMENTO } from '../tema'

const ContextoTema = createContext<{ escuro: boolean; alternar: () => void }>({ escuro: false, alternar: () => {} })

/**
 * Modo escuro da tela de Atendimento (estilo WhatsApp Web). A classe .tema-escuro
 * troca os tokens de cor só aqui dentro (globals.css); a escolha fica num cookie
 * por navegador, que a página lê no servidor para já abrir no tema certo.
 */
export function TemaAtendimento({ inicial, children }: { inicial: boolean; children: ReactNode }) {
  const [escuro, setEscuro] = useState(inicial)

  const alternar = () => {
    const novo = !escuro
    setEscuro(novo)
    document.cookie = `${COOKIE_TEMA_ATENDIMENTO}=${novo ? 'escuro' : 'claro'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <ContextoTema value={{ escuro, alternar }}>
      <div className={cn(escuro && 'tema-escuro')}>{children}</div>
    </ContextoTema>
  )
}

export function BotaoTema() {
  const { escuro, alternar } = use(ContextoTema)
  const rotulo = escuro ? 'Usar modo claro' : 'Usar modo escuro'
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={rotulo}
      title={rotulo}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-suave transition-colors hover:bg-ink/5 hover:text-ink"
    >
      {escuro ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  )
}
