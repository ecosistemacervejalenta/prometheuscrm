import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CheckoutPreVenda } from '@/features/pre-vendas/publico/checkout'
import { obterPreVendaPublica } from '@/features/pre-vendas/publico/queries'
import { param } from '@/lib/utils'

export async function generateMetadata({ params }: PageProps<'/p/[slug]'>): Promise<Metadata> {
  const dados = await obterPreVendaPublica((await params).slug)
  if (!dados) return { title: 'Pré-venda' }
  // Prévia do WhatsApp: sem *negrito*/_itálico_ do WhatsApp (aparecem literais) e numa linha só.
  const descricao =
    dados.preVenda.descricao?.replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) ||
    `Pré-venda exclusiva ${dados.loja.nome}. Garanta a sua!`
  return {
    title: { absolute: `${dados.preVenda.titulo} · ${dados.loja.nome}` },
    description: descricao,
    // A imagem vem de ./opengraph-image (foto das cervejas desta pré-venda).
    openGraph: { title: dados.preVenda.titulo, description: descricao, type: 'website' },
    twitter: { card: 'summary_large_image', title: dados.preVenda.titulo, description: descricao },
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
