import type { Metadata } from 'next'
import { HandCoins, ShoppingBag, TicketPercent } from 'lucide-react'

import { MarcaDoPortal } from '@/features/influenciadores/portal/components/casca'
import { FormularioEntrarNoPortal } from '@/features/influenciadores/portal/components/formularios'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: { absolute: 'Portal de parceiros' } }

/** O nome da loja muda raramente: a tela fica em cache e é refeita no máximo a cada hora. */
export const revalidate = 3600

/** Nome da loja para a tela de entrada (pública): só o nome, lido pelo servidor. */
async function nomeDaLoja(): Promise<string> {
  try {
    const { data } = await createAdminClient().from('configuracoes').select('nome_loja, influ_nome_loja').eq('id', 1).maybeSingle()
    return data?.influ_nome_loja?.trim() || data?.nome_loja?.trim() || 'Loja'
  } catch {
    return 'Loja'
  }
}

const VANTAGENS = [
  { icone: TicketPercent, titulo: 'Seu cupom e seu link', texto: 'Copie e compartilhe: o desconto entra sozinho no carrinho.' },
  { icone: ShoppingBag, titulo: 'Cada venda, em tempo quase real', texto: 'Veja os pedidos feitos com o seu cupom e a comissão de cada um.' },
  { icone: HandCoins, titulo: 'Quanto você tem a receber', texto: 'Comissões a liberar, disponíveis e todos os repasses já feitos.' },
]

export default async function PaginaEntrarNoPortal() {
  const loja = await nomeDaLoja()

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <MarcaDoPortal loja={loja} />
        <div className="max-w-md">
          <p className="tipo-rotulo text-volt">Programa de influenciadores</p>
          <p className="tipo-display mt-4 text-[56px] leading-[58px]">Suas vendas, suas comissões.</p>
          <ul className="mt-8 space-y-5">
            {VANTAGENS.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-volt">
                  <Icone className="size-[18px]" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{titulo}</span>
                  <span className="block text-[14px] text-white/60">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="tipo-dado text-[12px] text-white/40">Acesso exclusivo dos parceiros da {loja}</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-volt/10 blur-3xl" aria-hidden />
      </section>

      <section className="flex items-center justify-center px-5 pt-[max(48px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] sm:px-10 lg:py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <MarcaDoPortal loja={loja} clara />
          </div>
          <h1 className="tipo-h2">Entrar no Portal</h1>
          <p className="mt-2 text-suave">Use o e-mail e a senha que a {loja} enviou para você.</p>
          <div className="mt-8">
            <FormularioEntrarNoPortal />
          </div>
        </div>
      </section>
    </main>
  )
}
