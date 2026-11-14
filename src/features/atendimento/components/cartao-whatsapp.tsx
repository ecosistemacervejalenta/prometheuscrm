import { MessagesSquare, Webhook } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Codigo, Dado, Dados, UrlCopiavel } from '@/features/configuracoes/components/blocos'
import { formatarDataHora, formatarWhatsapp } from '@/lib/format'

import { ativarWebhookWhatsapp } from '../actions'
import type { StatusWhatsapp } from '../queries'

/** Situação do WhatsApp da loja em uma etiqueta (cabeçalho da seção e visão geral). */
export function situacaoWhatsapp(status: StatusWhatsapp): { tom: 'sucesso' | 'alerta' | 'perigo'; rotulo: string } {
  if (!status.configurado) return { tom: 'alerta', rotulo: 'Falta configurar' }
  if (status.erroConexao) return { tom: 'perigo', rotulo: 'Servidor inacessível' }
  if (!status.conectado) return { tom: 'perigo', rotulo: 'Número desconectado' }
  if (!status.webhookAtivo) return { tom: 'alerta', rotulo: 'Webhook inativo' }
  return { tom: 'sucesso', rotulo: 'Recebendo mensagens' }
}

export function SeloWhatsapp({ status }: { status: StatusWhatsapp }) {
  const { tom, rotulo } = situacaoWhatsapp(status)
  return <Badge tom={tom} ponto>{rotulo}</Badge>
}

/** Número conectado pela uazapi: de quem é e se está no ar. */
export function ConexaoWhatsapp({ status }: { status: StatusWhatsapp }) {
  return (
    <Card>
      <CardHeader
        titulo="Número conectado"
        descricao="Caixa de entrada da equipe em Atendimento: fila, responsáveis e histórico de cada cliente."
        acoes={
          <ButtonLink href="/atendimento" tamanho="sm">
            <MessagesSquare /> Abrir Atendimento
          </ButtonLink>
        }
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
        ) : status.erroConexao ? (
          <Alert tom="erro" titulo="Não foi possível falar com a uazapi">
            {status.erroConexao}
          </Alert>
        ) : (
          <>
            <Dados>
              <Dado rotulo="Número">
                <span className="tipo-dado">{status.numero ? formatarWhatsapp(status.numero) : '—'}</span>
              </Dado>
              <Dado rotulo="Perfil">{status.perfil ?? '—'}</Dado>
              <Dado rotulo="Conexão">{status.conectado ? 'Conectado' : 'Desconectado'}</Dado>
            </Dados>
            {!status.conectado && (
              <Alert tom="erro" titulo="O número está desconectado">
                Reconecte pelo QR Code no painel da uazapi.
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Webhook que traz as mensagens da uazapi para o CRM. Só aparece com o servidor configurado. */
export function WebhookWhatsapp({ status, ehAdmin }: { status: StatusWhatsapp; ehAdmin: boolean }) {
  if (!status.configurado) return null

  return (
    <Card>
      <CardHeader
        titulo="Recebimento das mensagens"
        descricao="A uazapi avisa o CRM a cada mensagem recebida (grupos ficam de fora) e a cada recibo de entrega e leitura."
        acoes={status.webhookAtivo ? <Badge tom="sucesso" ponto>Webhook ativo</Badge> : <Badge tom="alerta" ponto>Webhook inativo</Badge>}
      />
      <CardContent className="space-y-4 text-sm">
        <UrlCopiavel rotulo="URL do webhook" valor={status.urlWebhook} />

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

        {status.erroConexao ? null : ehAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton acao={ativarWebhookWhatsapp} variante={status.webhookAtivo ? 'secundario' : 'primario'} tamanho="sm">
              <Webhook /> {status.webhookAtivo ? 'Reaplicar webhook' : 'Ativar webhook'}
            </ActionButton>
            {!status.webhookAtivo && <p className="text-[13px] text-suave">Ative para as mensagens chegarem ao Atendimento na hora.</p>}
          </div>
        ) : (
          !status.webhookAtivo && <p className="text-[13px] text-suave">Peça a um administrador para ativar o webhook.</p>
        )}
      </CardContent>
    </Card>
  )
}
