import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Codigo, Passos, Pilha, UrlCopiavel } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'Shopify' }

const EVENTOS = ['orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'customers/create', 'customers/update']

export default async function PaginaShopify() {
  await exigirEquipe()
  const site = await urlDoSite()
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
      </Pilha>
    </>
  )
}
