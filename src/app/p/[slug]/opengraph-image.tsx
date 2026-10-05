import { notFound } from 'next/navigation'

import { gerarImagemCompartilhamento } from '@/features/pre-vendas/publico/imagem-compartilhamento'
import { obterPreVendaPublica } from '@/features/pre-vendas/publico/queries'

// Prévia do link no WhatsApp: foto das cervejas desta pré-venda (gerada a cada pedido de prévia).
export const alt = 'Pré-venda de cervejas'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/jpeg'
export const dynamic = 'force-dynamic'

export default async function ImagemDaPreVenda({ params }: { params: Promise<{ slug: string }> }) {
  const dados = await obterPreVendaPublica((await params).slug)
  if (!dados) notFound()
  return gerarImagemCompartilhamento(dados)
}
