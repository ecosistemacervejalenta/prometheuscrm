import type { ReactNode } from 'react'

import { Icone, Logo } from '@/components/marca/marca'

/** Layout das telas de acesso: painel Ink com a marca + formulário. */
export function TelaAcesso({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo variante="negativa" largura={180} prioridade />
        <div className="max-w-md">
          <p className="tipo-rotulo text-volt">CRM interno · v1.0</p>
          <p className="tipo-display mt-4 text-[64px] leading-[64px]">
            Tudo da loja em um só lugar.
          </p>
          <p className="mt-6 text-lg text-white/60">Shopify · App · Grupo VIP — clientes, pré-vendas, cobranças e contas.</p>
        </div>
        <p className="tipo-dado text-[12px] text-white/40">crm.prometheus</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 opacity-[0.07]" aria-hidden>
          <Icone variante="cor" tamanho={420} />
        </div>
      </section>

      <section className="flex items-center justify-center px-5 pt-[max(48px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] sm:px-10 lg:py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo variante="cor" largura={150} prioridade />
          </div>
          <h1 className="tipo-h2">{titulo}</h1>
          {descricao && <p className="mt-2 text-suave">{descricao}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  )
}
