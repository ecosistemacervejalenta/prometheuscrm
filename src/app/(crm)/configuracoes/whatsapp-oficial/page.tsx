import type { Metadata } from 'next'

import { CartaoConexao } from '@/features/campanhas/components/cartao-conexao'
import { GuiaMeta } from '@/features/campanhas/components/guia-meta'
import { conexaoMeta, contarDescadastros } from '@/features/campanhas/queries'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'
import { exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'WhatsApp oficial' }

// As ações desta página falam com a Meta (criação do modelo, foto, verificação): até 5 min.
export const maxDuration = 300

export default async function PaginaWhatsappOficial() {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const [conexao, descadastros, site] = await Promise.all([conexaoMeta(), contarDescadastros(), urlDoSite()])

  return (
    <>
      <CabecalhoConfiguracoes ativa="whatsapp-oficial" />
      <div className="space-y-5 lg:space-y-6">
        <CartaoConexao conexao={conexao} ehAdmin={ehAdmin} descadastros={descadastros} />
        <GuiaMeta conexao={conexao} urlWebhook={`${site}/api/webhooks/whatsapp-oficial`} ehAdmin={ehAdmin} />
      </div>
    </>
  )
}
