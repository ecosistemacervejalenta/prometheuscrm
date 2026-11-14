import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { ConexaoWhatsapp, SeloWhatsapp, WebhookWhatsapp } from '@/features/atendimento/components/cartao-whatsapp'
import { statusWhatsapp } from '@/features/atendimento/queries'
import { Pilha } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { hrefSecao } from '@/features/configuracoes/navegacao'
import { exigirEquipe } from '@/lib/auth'

export const metadata: Metadata = { title: 'WhatsApp da loja' }

export default async function PaginaWhatsappLoja() {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const status = await statusWhatsapp()

  return (
    <>
      <CabecalhoSecao secao="whatsapp" selo={<SeloWhatsapp status={status} />} somenteLeitura={!ehAdmin} />
      <Pilha estreita>
        <ConexaoWhatsapp status={status} />
        <WebhookWhatsapp status={status} ehAdmin={ehAdmin} />
        <p className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-linha bg-superficie px-4 py-3 text-sm lg:px-5">
          <span className="text-suave">Rodízio da fila, assinatura das mensagens e Banco de Leads ficam em Preferências.</span>
          <ButtonLink href={hrefSecao('atendimento')} tamanho="sm">
            Abrir Preferências <ArrowRight />
          </ButtonLink>
        </p>
      </Pilha>
    </>
  )
}
