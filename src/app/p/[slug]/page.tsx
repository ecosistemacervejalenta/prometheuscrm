import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CheckoutPreVenda } from '@/features/pre-vendas/publico/checkout'
import { obterPreVendaPublica } from '@/features/pre-vendas/publico/queries'
import { param } from '@/lib/utils'

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
    <div className="min-h-dvh bg-papel">
      <CheckoutPreVenda dados={dados} whatsappInicial={param(busca.w)} />
    </div>
  )
}
