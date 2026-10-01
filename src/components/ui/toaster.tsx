'use client'

import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { createContext, use, useCallback, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type Aviso = { id: number; mensagem: string; tom: 'sucesso' | 'erro' }

const ContextoAvisos = createContext<(mensagem: string, tom?: Aviso['tom']) => void>(() => {})

/** Hook para exibir avisos rápidos (toasts): `const avisar = useAvisos(); avisar('Salvo!')`. */
export function useAvisos() {
  return use(ContextoAvisos)
}

export function Toaster({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  const remover = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), [])

  const avisar = useCallback(
    (mensagem: string, tom: Aviso['tom'] = 'sucesso') => {
      const id = Date.now() + Math.random()
      setAvisos((lista) => [...lista.slice(-2), { id, mensagem, tom }])
      setTimeout(() => remover(id), 4500)
    },
    [remover],
  )

  return (
    <ContextoAvisos value={avisar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end print:hidden"
      >
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-flutuante',
            )}
          >
            {aviso.tom === 'sucesso' ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-volt" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-perigo" aria-hidden />
            )}
            <p className="min-w-0 flex-1">{aviso.mensagem}</p>
            <button type="button" onClick={() => remover(aviso.id)} className="text-white/60 hover:text-white" aria-label="Fechar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos>
  )
}
