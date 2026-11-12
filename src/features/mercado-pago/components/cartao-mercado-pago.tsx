import { ExternalLink, RefreshCw, Save, Unplug } from 'lucide-react'
import type { ReactNode } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { formatarDataHora } from '@/lib/format'

import { desconectarMercadoPago, salvarConexaoMercadoPago, testarConexaoMercadoPago } from '../actions'
import type { StatusMercadoPago } from '../queries'

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="tipo-rotulo text-suave">{rotulo}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  )
}

function Formulario({ status }: { status: StatusMercadoPago }) {
  return (
    <ActionForm action={salvarConexaoMercadoPago} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Access Token de produção"
          name="token"
          obrigatorio={!status.conectado}
          dica={status.conectado ? 'Já salvo e criptografado. Deixe vazio para manter o atual.' : 'Começa com APP_USR- (passo 2 do guia abaixo).'}
        >
          <Input name="token" type="password" autoComplete="off" spellCheck={false} placeholder={status.conectado ? '•••••••• salvo' : 'APP_USR-…'} />
        </Field>
        <Field
          label="Assinatura secreta do webhook"
          name="segredo_webhook"
          dica={status.assinatura_webhook ? 'Já salva. Deixe vazio para manter a atual.' : 'Opcional, mas recomendado (passo 4 do guia).'}
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
        <SubmitButton>
          <Save /> {status.conectado ? 'Salvar' : 'Conectar Mercado Pago'}
        </SubmitButton>
        <p className="text-[13px] text-suave">O token é conferido no Mercado Pago e fica criptografado no banco — ninguém consegue vê-lo de novo.</p>
      </div>
    </ActionForm>
  )
}

/** Conexão da conta do Mercado Pago que recebe os PIX do link da pré-venda. */
export function CartaoMercadoPago({ status, ehAdmin }: { status: StatusMercadoPago; ehAdmin: boolean }) {
  const selo = status.conectado ? (
    status.ultimo_erro ? (
      <Badge tom="perigo" ponto>Com erro</Badge>
    ) : (
      <Badge tom="sucesso" ponto>Conectado</Badge>
    )
  ) : (
    <Badge tom="alerta" ponto>Não conectado</Badge>
  )

  return (
    <Card>
      <CardHeader
        titulo="Mercado Pago"
        descricao="PIX com QR Code e copia e cola no valor exato do pedido. Quando o cliente paga, o pedido recebe baixa sozinho — sem comprovante."
        acoes={selo}
      />
      <CardContent className="space-y-4">
        {status.conectado && (
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-papel p-4 text-[14px] sm:grid-cols-4">
            <Dado rotulo="Conta">{status.conta_nome ?? status.conta_id ?? '—'}</Dado>
            <Dado rotulo="Conectado em">{formatarDataHora(status.conectado_em)}</Dado>
            <Dado rotulo="Último aviso recebido">{status.notificacao_recebida_em ? formatarDataHora(status.notificacao_recebida_em) : 'nenhum ainda'}</Dado>
            <Dado rotulo="PIX recebidos">{status.pix_recebidos}</Dado>
          </dl>
        )}

        {status.ultimo_erro && (
          <Alert tom="erro" titulo="O Mercado Pago recusou a última conferência">
            {status.ultimo_erro} Enquanto isso, o link mostra a chave PIX da loja e o envio do comprovante.
          </Alert>
        )}

        {status.conectado && (
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton acao={testarConexaoMercadoPago}>
              <RefreshCw /> Testar conexão
            </ActionButton>
            {ehAdmin && (
              <ActionButton
                acao={desconectarMercadoPago}
                variante="perigo"
                confirmar="Desconectar o Mercado Pago? O link volta a mostrar a chave PIX da loja e o cliente precisa mandar o comprovante."
              >
                <Unplug /> Desconectar
              </ActionButton>
            )}
          </div>
        )}

        {ehAdmin ? (
          status.conectado ? (
            <details className="group rounded-xl border border-linha">
              <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-semibold hover:bg-papel/60 [&::-webkit-details-marker]:hidden">
                Trocar token ou assinatura do webhook
              </summary>
              <div className="border-t border-linha p-4">
                <Formulario status={status} />
              </div>
            </details>
          ) : (
            <Formulario status={status} />
          )
        ) : (
          !status.conectado && <p className="text-[13px] text-suave">Um administrador precisa colar o Access Token para conectar.</p>
        )}
      </CardContent>
    </Card>
  )
}

/** Passo a passo para criar a aplicação no Mercado Pago e pegar as credenciais. */
export function GuiaMercadoPago({ urlWebhook }: { urlWebhook: string }) {
  const passos: Array<{ titulo: string; conteudo: ReactNode }> = [
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
          Em <b>Suas integrações</b>, clique em <b>Criar aplicação</b> (nome: “Prometheus CRM”; tipo: <b>Pagamentos online</b> ›{' '}
          <b>Checkout Transparente</b>). Dentro dela, abra <b>Credenciais de produção</b>, ative-as se pedir (ramo: bebidas; site:
          prometheuscrm.com.br) e copie o <b>Access Token</b> (começa com <code>APP_USR-</code>).
        </>
      ),
    },
    {
      titulo: 'Cole o token acima e clique em Conectar',
      conteudo: <>O CRM confere o token na hora e mostra o nome da conta. A partir daí o link da pré-venda já gera o PIX automático.</>,
    },
    {
      titulo: 'Configure o webhook (recomendado)',
      conteudo: (
        <>
          Na mesma aplicação, abra <b>Webhooks › Configurar notificações</b>, escolha <b>Modo produção</b>, cole a URL abaixo, marque o
          evento <b>Pagamentos</b> e salve. Depois clique para revelar a <b>Assinatura secreta</b> e cole no campo acima.
          <span className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
            <code className="tipo-dado min-w-0 flex-1 truncate text-[13px]">{urlWebhook}</code>
            <CopyButton texto={urlWebhook} rotulo="Copiar URL" />
          </span>
          <span className="mt-2 block text-[13px] text-suave">
            Cada PIX já avisa essa URL sozinho; a configuração no painel serve para validar a assinatura. Se um aviso se perder, o CRM
            confere os PIX pendentes a cada 10 minutos.
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
  ]

  return (
    <Card>
      <CardHeader
        titulo="Como conectar"
        descricao="Uns 10 minutos, feito uma vez só por um administrador."
        acoes={
          <a
            href="https://www.mercadopago.com.br/developers/panel/app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-volt-700 hover:text-ink"
          >
            Suas integrações <ExternalLink className="size-4" aria-hidden />
          </a>
        }
      />
      <CardContent>
        <ol className="space-y-4">
          {passos.map((p, i) => (
            <li key={p.titulo} className="flex gap-3">
              <span className="tipo-dado grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] text-white">{i + 1}</span>
              <div className="min-w-0 text-[14px] leading-6">
                <p className="font-semibold">{p.titulo}</p>
                <div className="text-ink/80">{p.conteudo}</div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
