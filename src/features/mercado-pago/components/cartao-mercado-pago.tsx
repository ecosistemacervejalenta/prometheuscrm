import { ExternalLink, RefreshCw, Save, Unplug } from 'lucide-react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonExternal } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dado, Dados, Passos, UrlCopiavel, ZonaDeRisco } from '@/features/configuracoes/components/blocos'
import { formatarDataHora } from '@/lib/format'

import { desconectarMercadoPago, salvarConexaoMercadoPago, testarConexaoMercadoPago } from '../actions'
import type { StatusMercadoPago } from '../queries'

/** Situação do Mercado Pago em uma etiqueta (cabeçalho da seção e visão geral). */
export function situacaoMercadoPago(status: StatusMercadoPago): { tom: 'sucesso' | 'alerta' | 'perigo'; rotulo: string } {
  if (!status.conectado) return { tom: 'alerta', rotulo: 'Não conectado' }
  return status.ultimo_erro ? { tom: 'perigo', rotulo: 'Com erro' } : { tom: 'sucesso', rotulo: 'Conectado' }
}

export function SeloMercadoPago({ status }: { status: StatusMercadoPago }) {
  const { tom, rotulo } = situacaoMercadoPago(status)
  return <Badge tom={tom} ponto>{rotulo}</Badge>
}

/** Conta do Mercado Pago que recebe os PIX do link da pré-venda. Só aparece depois de conectada. */
export function ConexaoMercadoPago({ status }: { status: StatusMercadoPago }) {
  if (!status.conectado) return null

  return (
    <Card>
      <CardHeader
        titulo="Conta conectada"
        descricao="PIX com QR Code e copia e cola no valor exato do pedido. Quando o cliente paga, o pedido recebe baixa sozinho — sem comprovante."
        acoes={
          <ActionButton acao={testarConexaoMercadoPago}>
            <RefreshCw /> Testar conexão
          </ActionButton>
        }
      />
      <CardContent className="space-y-4">
        <Dados colunas={4}>
          <Dado rotulo="Conta">{status.conta_nome ?? status.conta_id ?? '—'}</Dado>
          <Dado rotulo="Conectado em">{formatarDataHora(status.conectado_em)}</Dado>
          <Dado rotulo="Último aviso recebido">{status.notificacao_recebida_em ? formatarDataHora(status.notificacao_recebida_em) : 'nenhum ainda'}</Dado>
          <Dado rotulo="PIX recebidos">
            <span className="tipo-dado">{status.pix_recebidos}</span>
          </Dado>
        </Dados>
        {status.ultimo_erro && (
          <Alert tom="erro" titulo="O Mercado Pago recusou a última conferência">
            {status.ultimo_erro} Enquanto isso, o link mostra a chave PIX da loja e o envio do comprovante.
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/** Token e assinatura do webhook, colados por um administrador. Vão criptografados para o banco. */
export function CredenciaisMercadoPago({ status }: { status: StatusMercadoPago }) {
  return (
    <ActionForm action={salvarConexaoMercadoPago} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Access Token de produção"
          name="token"
          obrigatorio={!status.conectado}
          dica={status.conectado ? 'Já salvo e criptografado. Deixe vazio para manter o atual.' : 'Começa com APP_USR- (passo 2 do guia).'}
        >
          <Input name="token" type="password" autoComplete="off" spellCheck={false} placeholder={status.conectado ? '•••••••• salvo' : 'APP_USR-…'} />
        </Field>
        <Field
          label="Assinatura secreta do webhook"
          name="segredo_webhook"
          dica={status.assinatura_webhook ? 'Já salva. Deixe vazio para manter a atual.' : 'Passo 4 do guia (pode colar depois).'}
        >
          <Input
            name="segredo_webhook"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={status.assinatura_webhook ? '•••••••• salva' : ''}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variante={status.conectado ? 'escuro' : 'primario'}>
          <Save /> {status.conectado ? 'Salvar credenciais' : 'Conectar Mercado Pago'}
        </SubmitButton>
        <p className="min-w-0 flex-1 basis-56 text-[13px] text-suave">
          O token é conferido no Mercado Pago e fica criptografado no banco — ninguém consegue vê-lo de novo.
        </p>
      </div>
    </ActionForm>
  )
}

/** Passo a passo para criar a aplicação no Mercado Pago e pegar as credenciais. Sem moldura: a página decide o cartão. */
export function GuiaMercadoPago({ urlWebhook }: { urlWebhook: string }) {
  return (
    <div className="space-y-5">
      <Passos
        passos={[
          {
            titulo: 'Confira a chave PIX na conta do Mercado Pago',
            conteudo: (
              <>
                O PIX cai na conta do Mercado Pago da loja (a mesma do CNPJ). No app do Mercado Pago, vá em <b>Seu perfil › Suas chaves Pix</b> e
                confirme que há pelo menos uma chave cadastrada — sem ela o Mercado Pago não gera PIX.
              </>
            ),
          },
          {
            titulo: 'Crie a aplicação e copie o Access Token de produção',
            conteudo: (
              <>
                Em <b>Suas integrações</b>, clique em <b>Criar aplicação</b>: solução <b>Checkout Transparente</b>, tipo de API{' '}
                <b>API de Orders</b>, nome “Prometheus CRM”. Dentro dela, abra <b>Credenciais de produção</b>, ative-as se pedir (ramo: bebidas;
                site: prometheuscrm.com.br) e copie o <b>Access Token</b> (começa com <code>APP_USR-</code>).
              </>
            ),
          },
          {
            titulo: 'Cole o token em Credenciais e clique em Conectar',
            conteudo: <>O CRM confere o token na hora e mostra o nome da conta. A partir daí o link da pré-venda já gera o PIX automático.</>,
          },
          {
            titulo: 'Configure o webhook',
            conteudo: (
              <>
                Na mesma aplicação, abra <b>Webhooks › Configurar notificações</b>, escolha <b>Modo produção</b>, cole a URL abaixo, marque o
                evento <b>Order (Mercado Pago)</b> e salve. Depois clique para revelar a <b>Assinatura secreta</b> e cole em Credenciais.
                <UrlCopiavel rotulo="URL do webhook" valor={urlWebhook} className="mt-2" />
                <span className="mt-2 block text-[13px] text-suave">
                  É o aviso que dá a baixa na hora. Mesmo sem ele, a tela do cliente confere o pagamento sozinha e o CRM confere os PIX
                  pendentes a cada 10 minutos. Use o botão “Testar” do painel: o “Último aviso recebido” da conta conectada passa a mostrar a
                  hora.
                </span>
              </>
            ),
          },
          {
            titulo: 'Faça um teste de verdade',
            conteudo: (
              <>
                Abra o link de uma pré-venda, faça um pedido e pague o PIX com outro banco. Em poucos segundos a tela do cliente mostra
                “Pagamento confirmado”, o pedido fica <b>Pago</b> no CRM e chega o aviso no sino. Para devolver, use o estorno no próprio
                Mercado Pago — o pedido vira “Estornado” sozinho.
              </>
            ),
          },
        ]}
      />
      <ButtonExternal href="https://www.mercadopago.com.br/developers/panel/app" tamanho="sm">
        <ExternalLink /> Abrir “Suas integrações” no Mercado Pago
      </ButtonExternal>
    </div>
  )
}

export function DesconectarMercadoPago() {
  return (
    <ZonaDeRisco
      titulo="Desconectar o Mercado Pago"
      descricao="O link volta a mostrar a chave PIX da loja e o cliente precisa mandar o comprovante."
    >
      <ActionButton
        acao={desconectarMercadoPago}
        variante="perigo"
        confirmar="Desconectar o Mercado Pago? O link volta a mostrar a chave PIX da loja e o cliente precisa mandar o comprovante."
      >
        <Unplug /> Desconectar
      </ActionButton>
    </ZonaDeRisco>
  )
}
