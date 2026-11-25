import type { Metadata } from 'next'
import { ExternalLink, Search } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { ButtonExternal } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Pilha, Recolhivel, UrlCopiavel } from '@/features/configuracoes/components/blocos'
import { buscarEnderecoDaLoja, salvarRegras } from '@/features/influenciadores/actions'
import { FormularioRegras } from '@/features/influenciadores/components/formularios'
import { AbasInfluenciadores } from '@/features/influenciadores/components/selos'
import { AvisoDaShopify, GuiaDePermissoes, SituacaoDaShopify } from '@/features/influenciadores/components/shopify'
import { integracaoDoPrograma, regrasDoPrograma } from '@/features/influenciadores/queries'
import { exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'Ajustes do programa de influenciadores' }

export default async function PaginaAjustesDoPrograma() {
  const { perfil } = await exigirEquipe()
  const [integracao, regras, site] = await Promise.all([integracaoDoPrograma(), regrasDoPrograma(), urlDoSite()])
  const admin = perfil.papel === 'admin'
  const tudoLiberado = integracao.conectada && integracao.cupons && integracao.pedidos

  return (
    <>
      <PageHeader titulo="Ajustes do programa" contexto="Regras das comissões, ligação com a Shopify e Portal do influenciador" />
      <AbasInfluenciadores ativa="ajustes" />
      <AvisoDaShopify integracao={integracao} naTelaDeAjustes />

      <Pilha estreita>
        <Card>
          <CardHeader
            titulo="Regras das comissões"
            descricao="A comissão é calculada sobre os produtos do pedido, depois do desconto do cupom e das devoluções, sem o frete."
          />
          <CardContent>
            <FormularioRegras acao={salvarRegras} regras={regras} podeEditar={admin} />
            {admin && integracao.conectada && (!regras.loja_url || !regras.nome_no_portal) && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-papel p-3.5">
                <p className="min-w-0 flex-1 basis-56 text-[13px] text-suave">O nome e o endereço da loja podem vir direto da Shopify. Sem o endereço, o link de divulgação não aparece para os influenciadores.</p>
                <ActionButton acao={buscarEnderecoDaLoja}>
                  <Search aria-hidden /> Buscar na Shopify
                </ActionButton>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader titulo="Shopify" descricao="O mesmo app que calcula o frete lê os pedidos com cupom e cria os cupons dos influenciadores." />
          <CardContent>
            <SituacaoDaShopify integracao={integracao} sincronizadoEm={regras.sincronizado_em} erro={regras.sincronizacao_erro} />
          </CardContent>
        </Card>

        <Recolhivel
          titulo="Como dar as permissões ao app da Shopify"
          descricao={tudoLiberado ? 'Já feito: o app lê os pedidos e cria os cupons.' : 'Passo a passo — leva uns 3 minutos.'}
          aberto={integracao.conectada && !tudoLiberado}
        >
          <GuiaDePermissoes />
        </Recolhivel>

        <Card>
          <CardHeader
            titulo="Portal do influenciador"
            descricao="Onde cada influenciador entra com e-mail e senha para ver o cupom, as vendas, as comissões e os repasses. Ele só enxerga os próprios dados — nunca o CRM nem dados de clientes."
            acoes={
              <ButtonExternal href={`${site}/portal/entrar`} tamanho="sm">
                <ExternalLink aria-hidden /> Abrir
              </ButtonExternal>
            }
          />
          <CardContent className="space-y-3">
            <UrlCopiavel rotulo="Endereço do Portal" valor={`${site}/portal`} />
            <p className="text-[13px] text-suave">
              O login é criado na ficha de cada influenciador (botão “Criar acesso ao Portal”): o CRM gera uma senha temporária e a mensagem pronta
              para mandar pelo WhatsApp.
            </p>
          </CardContent>
        </Card>
      </Pilha>
    </>
  )
}
