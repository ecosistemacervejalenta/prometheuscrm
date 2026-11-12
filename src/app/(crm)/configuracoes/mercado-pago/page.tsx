import type { Metadata } from 'next'

import { Alert } from '@/components/ui/alert'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'
import { CartaoMercadoPago, GuiaMercadoPago } from '@/features/mercado-pago/components/cartao-mercado-pago'
import { statusMercadoPago } from '@/features/mercado-pago/queries'
import { exigirEquipe } from '@/lib/auth'
import { urlDaRequisicao } from '@/lib/url'

export const metadata: Metadata = { title: 'Mercado Pago' }

export default async function PaginaMercadoPago() {
  const { perfil } = await exigirEquipe()
  const [status, site] = await Promise.all([statusMercadoPago(), urlDaRequisicao()])

  return (
    <>
      <CabecalhoConfiguracoes ativa="mercado-pago" />
      <div className="space-y-5 lg:space-y-6">
        <Alert tom="info" titulo="Como funciona">
          No fim do link da pré-venda o cliente recebe um PIX (copia e cola + QR Code) no valor exato do pedido, gerado na conta do
          Mercado Pago da loja. Quando ele paga, a tela confirma na hora, o pedido fica <b>Pago</b> e chega um aviso no sino — sem conferir
          comprovante. Frete a cotar: o 1º PIX cobra só as cervejas; a mensagem do frete cotado leva um link para pagar o restante.
        </Alert>
        <CartaoMercadoPago status={status} ehAdmin={perfil.papel === 'admin'} />
        <GuiaMercadoPago urlWebhook={`${site}/api/webhooks/mercado-pago`} />
      </div>
    </>
  )
}
