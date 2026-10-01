'use client'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ErroCrm({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert tom="erro" titulo="Algo deu errado ao carregar esta tela">
        {error.message.includes('Variável de ambiente')
          ? error.message
          : 'Verifique sua conexão e tente novamente. Se persistir, confira as variáveis do Supabase.'}
        {error.digest && <span className="tipo-dado mt-2 block text-[11px]">código: {error.digest}</span>}
      </Alert>
      <Button className="mt-4" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  )
}
