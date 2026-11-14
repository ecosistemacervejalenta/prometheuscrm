import type { Metadata } from 'next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DesconectarMeta, NumeroMeta, SeloMeta } from '@/features/campanhas/components/cartao-conexao'
import { FormularioConexao } from '@/features/campanhas/components/formulario-conexao'
import { GuiaMeta } from '@/features/campanhas/components/guia-meta'
import { conexaoMeta, contarDescadastros } from '@/features/campanhas/queries'
import { Pilha, Recolhivel, SomenteAdmin } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { exigirEquipe } from '@/lib/auth'
import { urlDaRequisicao } from '@/lib/url'

export const metadata: Metadata = { title: 'WhatsApp oficial' }

// As ações desta página falam com a Meta (criação do modelo, foto, verificação): até 5 min.
export const maxDuration = 300

export default async function PaginaWhatsappOficial() {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const [conexao, descadastros, site] = await Promise.all([conexaoMeta(), contarDescadastros(), urlDaRequisicao()])

  return (
    <>
      <CabecalhoSecao secao="whatsapp-oficial" selo={<SeloMeta conexao={conexao} />} somenteLeitura={!ehAdmin} />
      <Pilha estreita>
        <NumeroMeta conexao={conexao} descadastros={descadastros} />

        {conexao.configurado ? (
          ehAdmin && (
            <Recolhivel titulo="Trocar token ou IDs" descricao="Só quando a Meta gerar credenciais novas ou o número mudar.">
              <FormularioConexao conexao={conexao} />
            </Recolhivel>
          )
        ) : (
          <Card>
            <CardHeader
              titulo="Credenciais da Meta"
              descricao="Número exclusivo das Campanhas. Cole aqui o que o passo a passo abaixo pede."
            />
            <CardContent>
              {ehAdmin ? (
                <FormularioConexao conexao={conexao} />
              ) : (
                <SomenteAdmin>Um administrador precisa colar o token e os IDs da Meta aqui.</SomenteAdmin>
              )}
            </CardContent>
          </Card>
        )}

        <GuiaMeta conexao={conexao} urlWebhook={`${site}/api/webhooks/whatsapp-oficial`} ehAdmin={ehAdmin} />

        {ehAdmin && conexao.configurado && <DesconectarMeta />}
      </Pilha>
    </>
  )
}
