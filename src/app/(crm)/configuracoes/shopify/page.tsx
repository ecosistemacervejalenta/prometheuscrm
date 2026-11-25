import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Codigo, Passos, Pilha, Recolhivel, SomenteAdmin, UrlCopiavel } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import {
  ConexaoShopify,
  CredenciaisShopify,
  DesconectarShopify,
  GuiaFreteShopify,
  SeloFreteShopify,
} from '@/features/shopify/components/cartao-shopify'
import { TestarFrete } from '@/features/shopify/components/testar-frete'
import { statusShopify } from '@/features/shopify/queries'
import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'Shopify' }

const EVENTOS = ['orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'customers/create', 'customers/update']

export default async function PaginaShopify() {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const [site, frete] = await Promise.all([urlDoSite(), statusShopify()])
  const segredoOk = Boolean(envServidor.shopifyWebhookSecret)

  return (
    <>
      <CabecalhoSecao
        secao="shopify"
        selo={segredoOk ? <Badge tom="sucesso" ponto>Segredo configurado</Badge> : <Badge tom="alerta" ponto>Falta o segredo</Badge>}
      />
      <Pilha estreita>
        <Card>
          <CardHeader titulo="Como ligar a loja" descricao="A Shopify avisa o CRM a cada pedido e cliente novo ou alterado." />
          <CardContent>
            <Passos
              passos={[
                {
                  titulo: 'Abra os webhooks no admin da Shopify',
                  conteudo: (
                    <>
                      Em <strong>Configurações › Notificações › Webhooks</strong>, crie webhooks em <strong>JSON</strong> apontando para:
                      <UrlCopiavel rotulo="URL do webhook" valor={`${site}/api/webhooks/shopify`} className="mt-2" />
                    </>
                  ),
                },
                {
                  titulo: 'Crie um webhook para cada evento',
                  conteudo: (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {EVENTOS.map((e) => (
                        <Codigo key={e}>{e}</Codigo>
                      ))}
                    </span>
                  ),
                },
                {
                  titulo: 'Cadastre o segredo na Vercel',
                  conteudo: (
                    <>
                      A Shopify mostra o segredo de assinatura na mesma tela dos webhooks. Cadastre como{' '}
                      <Codigo>SHOPIFY_WEBHOOK_SECRET</Codigo> na Vercel e faça o Redeploy.
                      {!segredoOk && <span className="mt-1 block font-semibold text-alerta">O servidor ainda não encontrou essa variável.</span>}
                    </>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader titulo="Como os produtos são reconhecidos" />
          <CardContent className="text-sm">
            Os itens de cada pedido são vinculados às cervejas do CRM pelo <strong>ID da variante</strong> ou pelo <strong>SKU</strong>.
          </CardContent>
        </Card>

        {/* Frete calculado pelo Olist Envios (app de entregas instalado na loja) ------------- */}
        <Card>
          <CardHeader
            titulo="Frete pelo Olist Envios"
            descricao="Para os pedidos do link da pré-venda com CEP fora da lista de CEPs VIP."
            acoes={frete.conectado ? undefined : <SeloFreteShopify status={frete} />}
          />
          <CardContent className="space-y-2 text-sm">
            <p>
              Quando o cliente coloca cervejas na Caixa VIP ou fecha a caixa, o CRM pergunta à loja quanto custa o envio — a Shopify
              consulta o <b>Olist Envios</b> — e cobra a <b>opção mais barata</b>, já somada no PIX. Cada cerveja conta <b>500 g</b> (o kit
              conta cada cerveja de dentro) e o frete é um só para a caixa: entrou cerveja nova, ele é calculado de novo.
            </p>
            <p className="text-suave">
              CEP da lista VIP continua com o frete fixo. Nada é criado na Shopify, e a etiqueta continua sendo comprada na Olist. Se a
              Shopify não responder, o pedido fica “frete a cotar” e a equipe informa o valor, como antes.
            </p>
          </CardContent>
        </Card>

        <ConexaoShopify status={frete} />

        {frete.conectado ? (
          <>
            <Card>
              <CardHeader titulo="Testar um frete" descricao="A mesma conta do link, para um CEP e uma quantidade de cervejas. Não cria nada." />
              <CardContent>
                <TestarFrete />
              </CardContent>
            </Card>
            {ehAdmin && (
              <Recolhivel titulo="Trocar as credenciais do app" descricao="Só se o Client secret for trocado na Shopify ou o app for recriado.">
                <CredenciaisShopify status={frete} />
              </Recolhivel>
            )}
            <Recolhivel titulo="Passo a passo da conexão" descricao="Para conferir a permissão ou refazer o app.">
              <GuiaFreteShopify />
            </Recolhivel>
            {ehAdmin && <DesconectarShopify />}
          </>
        ) : (
          <>
            <Card>
              <CardHeader titulo="Credenciais do app" descricao="Cole aqui o que o passo a passo abaixo pede." />
              <CardContent>
                {ehAdmin ? (
                  <CredenciaisShopify status={frete} />
                ) : (
                  <SomenteAdmin>Um administrador precisa colar as credenciais do app para conectar.</SomenteAdmin>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader titulo="Como conectar" descricao="Uns 10 minutos, feito uma vez só por um administrador da loja." />
              <CardContent>
                <GuiaFreteShopify />
              </CardContent>
            </Card>
          </>
        )}
      </Pilha>
    </>
  )
}
