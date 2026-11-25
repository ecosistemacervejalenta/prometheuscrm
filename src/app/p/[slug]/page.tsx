import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { after } from 'next/server'

import { atualizarEstoqueDaPreVenda } from '@/features/olist/estoque'
import { CheckoutPreVenda } from '@/features/pre-vendas/publico/checkout'
import { textoDaPrevia } from '@/features/pre-vendas/publico/previa-link'
import { obterPreVendaPublica } from '@/features/pre-vendas/publico/queries'
import { param } from '@/lib/utils'

export async function generateMetadata({ params }: PageProps<'/p/[slug]'>): Promise<Metadata> {
  const dados = await obterPreVendaPublica((await params).slug)
  if (!dados) return { title: 'Pré-venda' }
  // Prévia do WhatsApp: texto padrão (nome da cerveja + chamada do Grupo VIP), igual em todos os links.
  const { titulo, descricao } = textoDaPrevia(dados)
  return {
    title: { absolute: titulo },
    description: descricao,
    // A imagem vem de ./opengraph-image (foto das cervejas desta pré-venda).
    openGraph: { title: titulo, description: descricao, type: 'website' },
    twitter: { card: 'summary_large_image', title: titulo, description: descricao },
  }
}

export default async function PaginaPublicaPreVenda({ params, searchParams }: PageProps<'/p/[slug]'>) {
  const [{ slug }, busca] = await Promise.all([params, searchParams])
  const dados = await obterPreVendaPublica(slug)
  if (!dados) notFound()
  // Estoque da Olist com mais de 2 min: lê de novo depois de responder (a compra confere no banco).
  if (dados.preVenda.ativa) after(() => atualizarEstoqueDaPreVenda(slug).catch(() => undefined))

  return (
    <div className="min-h-dvh bg-papel">
      <CheckoutPreVenda dados={dados} whatsappInicial={param(busca.w)} />
    </div>
  )
}
