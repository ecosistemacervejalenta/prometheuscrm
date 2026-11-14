import type { Metadata } from 'next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Pilha, Recolhivel, SomenteAdmin } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import {
  ConexaoMercadoPago,
  CredenciaisMercadoPago,
  DesconectarMercadoPago,
  GuiaMercadoPago,
  SeloMercadoPago,
} from '@/features/mercado-pago/components/cartao-mercado-pago'
import { statusMercadoPago } from '@/features/mercado-pago/queries'
import { exigirEquipe } from '@/lib/auth'
import { urlDaRequisicao } from '@/lib/url'

export const metadata: Metadata = { title: 'Mercado Pago' }

export default async function PaginaMercadoPago() {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const [status, site] = await Promise.all([statusMercadoPago(), urlDaRequisicao()])
  const guia = <GuiaMercadoPago urlWebhook={`${site}/api/webhooks/mercado-pago`} />

  return (
    <>
      <CabecalhoSecao secao="mercado-pago" selo={<SeloMercadoPago status={status} />} somenteLeitura={!ehAdmin} />
      <Pilha estreita>
        <Card>
          <CardHeader titulo="Como funciona" />
          <CardContent className="text-sm">
            No fim do link da pré-venda o cliente recebe um PIX (copia e cola + QR Code) no valor exato do pedido, gerado na conta do
            Mercado Pago da loja. Quando ele paga, a tela confirma na hora, o pedido fica <b>Pago</b> e chega um aviso no sino — sem
            conferir comprovante. Frete a cotar: o 1º PIX cobra só as cervejas; a mensagem do frete cotado leva um link para pagar o
            restante.
          </CardContent>
        </Card>

        <ConexaoMercadoPago status={status} />

        {status.conectado ? (
          <>
            {ehAdmin && (
              <Recolhivel titulo="Trocar token ou assinatura do webhook" descricao="Só quando o Mercado Pago gerar credenciais novas.">
                <CredenciaisMercadoPago status={status} />
              </Recolhivel>
            )}
            <Recolhivel titulo="Passo a passo da conexão" descricao="Para conferir o webhook ou refazer a aplicação.">
              {guia}
            </Recolhivel>
            {ehAdmin && <DesconectarMercadoPago />}
          </>
        ) : (
          <>
            <Card>
              <CardHeader titulo="Credenciais" descricao="Cole aqui o que o passo a passo abaixo pede." />
              <CardContent>
                {ehAdmin ? (
                  <CredenciaisMercadoPago status={status} />
                ) : (
                  <SomenteAdmin>Um administrador precisa colar o Access Token para conectar.</SomenteAdmin>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader titulo="Como conectar" descricao="Uns 10 minutos, feito uma vez só por um administrador." />
              <CardContent>{guia}</CardContent>
            </Card>
          </>
        )}
      </Pilha>
    </>
  )
}
