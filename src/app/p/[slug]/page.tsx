import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Lock, MessageCircle } from 'lucide-react'

import { Logo } from '@/components/marca/marca'
import { ButtonExternal } from '@/components/ui/button'
import { CheckoutPreVenda } from '@/features/pre-vendas/publico/checkout'
import { obterPreVendaPublica } from '@/features/pre-vendas/publico/queries'
import { param } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/whatsapp'

export async function generateMetadata({ params }: PageProps<'/p/[slug]'>): Promise<Metadata> {
  const dados = await obterPreVendaPublica((await params).slug)
  if (!dados) return { title: 'Pré-venda' }
  const descricao = dados.preVenda.descricao ?? `Pré-venda exclusiva ${dados.loja.nome}. Garanta a sua!`
  return {
    title: { absolute: `${dados.preVenda.titulo} · ${dados.loja.nome}` },
    description: descricao,
    openGraph: {
      title: dados.preVenda.titulo,
      description: descricao,
      images: [{ url: '/brand/banner-1500x500.png', width: 1500, height: 500 }],
    },
  }
}

export default async function PaginaPublicaPreVenda({ params, searchParams }: PageProps<'/p/[slug]'>) {
  const [{ slug }, busca] = await Promise.all([params, searchParams])
  const dados = await obterPreVendaPublica(slug)
  if (!dados) notFound()

  return (
    <main className="min-h-screen bg-papel">
      <div className="mx-auto max-w-md px-4 pt-6 pb-10">
        <header className="mb-6 flex justify-center">
          <Logo variante="cor" largura={130} prioridade />
        </header>

        {dados.preVenda.ativa ? (
          <CheckoutPreVenda dados={dados} whatsappInicial={param(busca.w)} />
        ) : (
          <div className="rounded-[28px] bg-ink p-8 text-center text-white">
            <Lock className="mx-auto size-10 text-volt" aria-hidden />
            <h1 className="tipo-h2 mt-4">{dados.preVenda.titulo}</h1>
            <p className="mt-2 text-white/70">Esta pré-venda foi encerrada. Fique de olho no grupo para a próxima!</p>
            {dados.loja.whatsapp && (
              <ButtonExternal
                href={linkWhatsapp(dados.loja.whatsapp, `Oi! Vi a pré-venda "${dados.preVenda.titulo}" e queria saber das próximas.`)}
                variante="primario"
                bloco
                tamanho="lg"
                className="mt-6"
              >
                <MessageCircle /> Falar com a loja
              </ButtonExternal>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
