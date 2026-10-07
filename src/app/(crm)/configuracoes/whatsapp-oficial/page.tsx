import type { Metadata } from 'next'
import { randomBytes } from 'node:crypto'

import { GuiaMeta } from '@/features/campanhas/components/guia-meta'
import { statusMeta } from '@/features/campanhas/queries'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'
import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'WhatsApp oficial' }

export default async function PaginaWhatsappOficial() {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const site = await urlDoSite()
  // Enquanto não há token de verificação na Vercel, o admin recebe uma sugestão nova a cada visita.
  const tokenVerificacao = ehAdmin ? (envServidor.metaWebhookVerifyToken ?? randomBytes(24).toString('hex')) : null

  return (
    <>
      <CabecalhoConfiguracoes ativa="whatsapp-oficial" />
      <GuiaMeta
        status={statusMeta()}
        urlWebhook={`${site}/api/webhooks/whatsapp-oficial`}
        tokenVerificacao={tokenVerificacao}
        ehAdmin={ehAdmin}
      />
    </>
  )
}
