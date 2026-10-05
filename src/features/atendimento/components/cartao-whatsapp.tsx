import { MessagesSquare, Webhook } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { formatarDataHora, formatarWhatsapp } from '@/lib/format'

import { ativarWebhookWhatsapp } from '../actions'
import type { ConfigAtendimento, StatusWhatsapp } from '../queries'
import { FormularioConfigAtendimento } from './formulario-config'

function Codigo({ children }: { children: string }) {
  return <code className="tipo-dado text-[12px]">{children}</code>
}

/** WhatsApp da loja (uazapi): conexão, webhook e preferências do Atendimento. */
export function CartaoWhatsapp({ status, config, ehAdmin }: { status: StatusWhatsapp; config: ConfigAtendimento; ehAdmin: boolean }) {
  const selo = !status.configurado ? (
    <Badge tom="alerta" ponto>Falta configurar</Badge>
  ) : status.erroConexao ? (
    <Badge tom="perigo" ponto>Servidor inacessível</Badge>
  ) : !status.conectado ? (
    <Badge tom="perigo" ponto>Número desconectado</Badge>
  ) : status.webhookAtivo ? (
    <Badge tom="sucesso" ponto>Recebendo mensagens</Badge>
  ) : (
    <Badge tom="alerta" ponto>Webhook inativo</Badge>
  )

  return (
    <Card>
      <div id="whatsapp" className="scroll-mt-6" />
      <CardHeader
        titulo="WhatsApp da loja (uazapi)"
        descricao="Caixa de entrada da equipe em Atendimento: fila, responsáveis e histórico de cada cliente."
        acoes={selo}
      />
      <CardContent className="space-y-4 text-sm">
        {!status.configurado ? (
          <Alert tom="alerta" titulo="O servidor ainda não encontrou:">
            {status.variaveisFaltando.map((nome, i) => (
              <span key={nome}>
                {i > 0 && ' e '}
                <Codigo>{nome}</Codigo>
              </span>
            ))}
            . Use a Server URL e o token da <strong>instância</strong> (painel uazapiGO), cadastre na Vercel em Production e faça o
            Redeploy.
          </Alert>
        ) : (
          <>
            {status.erroConexao ? (
              <Alert tom="erro" titulo="Não foi possível falar com a uazapi">{status.erroConexao}</Alert>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="tipo-rotulo text-suave">Número</dt>
                  <dd className="tipo-dado mt-0.5">{status.numero ? formatarWhatsapp(status.numero) : '—'}</dd>
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Perfil</dt>
                  <dd className="mt-0.5">{status.perfil ?? '—'}</dd>
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Conexão</dt>
                  <dd className="mt-0.5">{status.conectado ? 'Conectado' : 'Desconectado — reconecte pelo QR Code no painel da uazapi'}</dd>
                </div>
              </dl>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
              <span className="tipo-rotulo w-full text-suave">URL do webhook</span>
              <code className="tipo-dado flex-1 text-[13px] break-all">{status.urlWebhook}</code>
              <CopyButton texto={status.urlWebhook} />
            </div>

            {!status.webhookAtivo && !status.erroConexao && (
              <p className="text-suave">
                Clique em <strong className="text-ink">Ativar webhook</strong> para a uazapi enviar ao CRM as mensagens recebidas
                (grupos ficam de fora) e os recibos de entrega e leitura.
              </p>
            )}
            {status.outrosWebhooks.length > 0 && (
              <Alert tom="info" titulo="Outro destino de webhook na instância">
                {status.outrosWebhooks.join(', ')}. Ativar o webhook do CRM substitui o destino principal.
              </Alert>
            )}
            {status.errosRecentes.length > 0 && (
              <Alert tom="alerta" titulo="Entregas recentes com erro (uazapi → CRM)">
                <ul className="mt-1 space-y-0.5 text-[12px]">
                  {status.errosRecentes.map((e, i) => (
                    <li key={i}>
                      {e.created ? formatarDataHora(e.created) : ''} · {e.event} · {e.status_code ?? ''} {e.error}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px]">A rotina /api/cron/whatsapp recupera as mensagens perdidas a cada 2 h.</p>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {ehAdmin && !status.erroConexao && (
                <ActionButton acao={ativarWebhookWhatsapp} variante={status.webhookAtivo ? 'secundario' : 'primario'} tamanho="sm">
                  <Webhook /> {status.webhookAtivo ? 'Reaplicar webhook' : 'Ativar webhook'}
                </ActionButton>
              )}
              <ButtonLink href="/atendimento" tamanho="sm">
                <MessagesSquare /> Abrir Atendimento
              </ButtonLink>
            </div>
          </>
        )}

        <div className="border-t border-linha pt-4">
          <h3 className="mb-3 text-[14px] font-semibold">Preferências do atendimento</h3>
          {ehAdmin ? (
            <FormularioConfigAtendimento config={config} />
          ) : (
            <p className="text-[13px] text-suave">Somente administradores alteram as preferências.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
