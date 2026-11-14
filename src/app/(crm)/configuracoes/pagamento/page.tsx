import type { Metadata } from 'next'
import { ArrowRight, QrCode, ReceiptText } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Pilha } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { FormularioPagamentoPix } from '@/features/configuracoes/components/formularios'
import { hrefSecao } from '@/features/configuracoes/navegacao'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { statusMercadoPago } from '@/features/mercado-pago/queries'

export const metadata: Metadata = { title: 'Pagamento por PIX' }

export default async function PaginaPagamento() {
  const [config, mercadoPago] = await Promise.all([obterConfiguracoes(), statusMercadoPago()])
  const automatico = mercadoPago.conectado && !mercadoPago.ultimo_erro

  return (
    <>
      <CabecalhoSecao secao="pagamento" />
      <Pilha estreita>
        <Card>
          <CardHeader
            titulo="Como o cliente paga hoje"
            acoes={automatico ? <Badge tom="sucesso" ponto>PIX automático</Badge> : <Badge ponto>Chave PIX + comprovante</Badge>}
          />
          <CardContent>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-papel text-ink ring-1 ring-linha" aria-hidden>
                {automatico ? <QrCode className="size-5" /> : <ReceiptText className="size-5" />}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {automatico ? (
                  <p>
                    O link gera um PIX no valor exato do pedido pela conta{' '}
                    <strong>{mercadoPago.conta_nome ?? 'do Mercado Pago'}</strong> e o pedido recebe baixa sozinho. A chave abaixo fica de
                    reserva: aparece se o Mercado Pago estiver com erro ou for desconectado.
                  </p>
                ) : (
                  <p>
                    O link mostra a chave PIX da loja e o cliente manda o comprovante pelo WhatsApp. Conectando o Mercado Pago, o PIX
                    passa a ter QR Code e baixa automática.
                  </p>
                )}
                <ButtonLink href={hrefSecao('mercado-pago')} tamanho="sm" className="mt-3">
                  {automatico ? 'Ver conexão do Mercado Pago' : 'Conectar o Mercado Pago'} <ArrowRight />
                </ButtonLink>
              </div>
            </div>
          </CardContent>
        </Card>

        {mercadoPago.ultimo_erro && (
          <Alert tom="alerta" titulo="O Mercado Pago está com erro">
            Enquanto isso, o link mostra a chave PIX da loja e o envio do comprovante.
          </Alert>
        )}
        {!config.chave_pix && !automatico && (
          <Alert tom="alerta" titulo="Falta a chave PIX">
            Sem ela, o link da pré-venda não consegue mostrar os dados de pagamento ao cliente.
          </Alert>
        )}

        <FormularioPagamentoPix config={config} />
      </Pilha>
    </>
  )
}
