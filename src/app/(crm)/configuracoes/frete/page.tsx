import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { FormularioValorFrete, ListaCepsVip, TestarCep } from '@/features/frete/components/configuracao-frete'
import { resumoCepsVip } from '@/features/frete/queries'
import { formatarMoeda, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Frete VIP' }

export default async function PaginaFreteVip() {
  const [config, resumo] = await Promise.all([obterConfiguracoes(), resumoCepsVip()])

  return (
    <>
      <CabecalhoSecao
        secao="frete"
        selo={
          resumo.ceps_cobertos > 0 ? (
            <Badge>{formatarNumero(resumo.ceps_cobertos)} CEPs com frete fixo</Badge>
          ) : (
            <Badge tom="alerta" ponto>Sem lista de CEPs</Badge>
          )
        }
      />
      <div className="grid gap-5 lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader
            titulo="Lista de CEPs VIP"
            descricao="Envie a planilha com os CEPs atendidos. Aceita CEPs avulsos e faixas (CEP inicial e final). Cada envio substitui a lista inteira."
          />
          <CardContent>
            <ListaCepsVip resumo={resumo} arquivo={config.frete_vip_arquivo} importadoEm={config.frete_vip_importado_em} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-5 sm:grid-cols-2 lg:gap-6 2xl:grid-cols-1">
          <Card>
            <CardHeader titulo="Valor do frete" />
            <CardContent>
              <FormularioValorFrete valor={config.frete_vip_valor} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader titulo="Testar um CEP" descricao="Veja o que o cliente vai ver no link." />
            <CardContent>
              <TestarCep />
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 2xl:col-span-1">
            <CardHeader titulo="Como funciona no link" />
            <CardContent>
              <ul className="space-y-2.5 text-sm">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-volt" aria-hidden />
                  <span>
                    <b>CEP na lista:</b> o cliente vê o frete fixo de {formatarMoeda(config.frete_vip_valor)} já somado ao total.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-alerta" aria-hidden />
                  <span>
                    <b>Fora da lista:</b> o pedido entra como “frete a cotar”. Você informa o valor no Grupo VIP e envia ao cliente pelo
                    WhatsApp antes do fechamento.
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
