import type { Metadata } from 'next'
import { Pause, Play, RefreshCw, Send, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import {
  alternarWebhook,
  excluirWebhook,
  processarFilaAgora,
  reenviarEvento,
  testarWebhook,
} from '@/features/configuracoes/actions'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'
import { FormularioWebhook } from '@/features/configuracoes/components/formularios'
import { listarEventosRecentes, listarWebhooks } from '@/features/configuracoes/queries'
import { envServidor } from '@/lib/env.server'
import { formatarDataCurta, formatarHora } from '@/lib/format'
import type { Tom } from '@/lib/rotulos'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'Integrações' }

const TOM_EVENTO: Record<string, Tom> = { pendente: 'alerta', enviado: 'sucesso', erro: 'perigo', ignorado: 'neutro' }

function Status({ ok, sim, nao }: { ok: boolean; sim: string; nao: string }) {
  return ok ? <Badge tom="sucesso" ponto>{sim}</Badge> : <Badge tom="alerta" ponto>{nao}</Badge>
}

function Endpoint({ metodo, caminho, descricao }: { metodo: string; caminho: string; descricao: string }) {
  return (
    <TR>
      <TD><Badge tom={metodo === 'GET' ? 'shopify' : metodo === 'POST' ? 'volt' : 'app'}>{metodo}</Badge></TD>
      <TD className="tipo-dado text-[13px]">{caminho}</TD>
      <TD className="text-[13px] text-suave">{descricao}</TD>
    </TR>
  )
}

export default async function PaginaIntegracoes() {
  const [webhooks, eventos, site] = await Promise.all([listarWebhooks(), listarEventosRecentes(), urlDoSite()])

  return (
    <>
      <CabecalhoConfiguracoes ativa="integracoes" />

      <div className="space-y-6">
        {/* n8n / webhooks de saída */}
        <Card>
          <CardHeader
            titulo="Webhooks de saída (n8n, Zapier, App)"
            descricao="Cada evento do CRM é enviado por POST com assinatura HMAC-SHA256 no header X-Prometheus-Assinatura."
          />
          {webhooks.length > 0 && (
            <Table>
              <THead>
                <TR>
                  <TH>Destino</TH>
                  <TH>Eventos</TH>
                  <TH>Segredo</TH>
                  <TH className="text-right">Ações</TH>
                </TR>
              </THead>
              <TBody>
                {webhooks.map((w) => (
                  <TR key={w.id} className={w.ativo ? undefined : 'opacity-60'}>
                    <TD>
                      <p className="font-semibold">{w.nome} {!w.ativo && <Badge>Pausado</Badge>}</p>
                      <p className="tipo-dado max-w-xs truncate text-[12px] text-suave">{w.url}</p>
                    </TD>
                    <TD>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {w.eventos.map((e) => <Badge key={e}>{e === '*' ? 'todos' : e}</Badge>)}
                      </div>
                    </TD>
                    <TD>
                      <span className="tipo-dado mr-2 text-[12px] text-suave">{w.segredo.slice(0, 6)}••••</span>
                      <CopyButton texto={w.segredo} rotulo="Copiar" />
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        <ActionButton acao={testarWebhook.bind(null, w.id)}><Send /> Testar</ActionButton>
                        <ActionButton acao={alternarWebhook.bind(null, w.id, !w.ativo)} titulo={w.ativo ? 'Pausar' : 'Ativar'}>
                          {w.ativo ? <Pause /> : <Play />}
                        </ActionButton>
                        <ActionButton acao={excluirWebhook.bind(null, w.id)} variante="perigo" titulo="Excluir" confirmar={`Excluir o webhook ${w.nome}?`}>
                          <Trash2 />
                        </ActionButton>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <CardContent className="border-t border-linha pt-5">
            <FormularioWebhook />
          </CardContent>
        </Card>

        {/* Fila de eventos */}
        <Card>
          <CardHeader
            titulo="Fila de eventos"
            descricao="Os eventos são entregues logo após cada ação e, como garantia, pela rotina /api/cron/eventos."
            acoes={<ActionButton acao={processarFilaAgora}><RefreshCw /> Processar agora</ActionButton>}
          />
          {eventos.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-suave">Nenhum evento registrado ainda.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Evento</TH>
                  <TH>Quando</TH>
                  <TH>Status</TH>
                  <TH>Detalhe</TH>
                  <TH className="text-right">Ação</TH>
                </TR>
              </THead>
              <TBody>
                {eventos.map((e) => (
                  <TR key={e.id}>
                    <TD className="tipo-dado text-[13px]">{e.tipo}</TD>
                    <TD className="tipo-dado text-[12px] text-suave">{formatarDataCurta(e.criado_em)} {formatarHora(e.criado_em)}</TD>
                    <TD><Badge tom={TOM_EVENTO[e.status] ?? 'neutro'} ponto>{e.status}</Badge></TD>
                    <TD className="max-w-sm truncate text-[12px] text-suave" title={e.ultimo_erro ?? undefined}>
                      {e.ultimo_erro ?? (e.tentativas > 0 ? `${e.tentativas} tentativa(s)` : '—')}
                    </TD>
                    <TD className="text-right">
                      {(e.status === 'erro' || e.status === 'ignorado') && (
                        <ActionButton acao={reenviarEvento.bind(null, e.id)}>Reenviar</ActionButton>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Shopify */}
          <Card>
            <CardHeader
              titulo="Shopify"
              descricao="Pedidos e clientes da loja entram no CRM automaticamente."
              acoes={<Status ok={Boolean(envServidor.shopifyWebhookSecret)} sim="Segredo configurado" nao="Falta SHOPIFY_WEBHOOK_SECRET" />}
            />
            <CardContent className="space-y-3 text-sm">
              <p>No admin da Shopify: <strong>Configurações › Notificações › Webhooks</strong>, crie webhooks em JSON apontando para:</p>
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
                <code className="tipo-dado flex-1 text-[13px] break-all">{site}/api/webhooks/shopify</code>
                <CopyButton texto={`${site}/api/webhooks/shopify`} />
              </div>
              <p className="text-suave">
                Eventos: <code className="tipo-dado text-[12px]">orders/create</code>, <code className="tipo-dado text-[12px]">orders/updated</code>,{' '}
                <code className="tipo-dado text-[12px]">orders/paid</code>, <code className="tipo-dado text-[12px]">orders/cancelled</code>,{' '}
                <code className="tipo-dado text-[12px]">customers/create</code>, <code className="tipo-dado text-[12px]">customers/update</code>.
                Produtos são vinculados pelo <em>ID da variante</em> ou <em>SKU</em>.
              </p>
            </CardContent>
          </Card>

          {/* Cron */}
          <Card>
            <CardHeader
              titulo="Rotina de reenvio (cron)"
              descricao="Garante a entrega dos eventos que falharam."
              acoes={<Status ok={Boolean(envServidor.cronSecret)} sim="CRON_SECRET ok" nao="Falta CRON_SECRET" />}
            />
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
                <code className="tipo-dado flex-1 text-[13px] break-all">GET {site}/api/cron/eventos</code>
              </div>
              <p className="text-suave">
                A Vercel chama essa rota pelo <code className="tipo-dado text-[12px]">vercel.ts</code>. No plano Hobby o cron é diário — para
                reenvio a cada minuto, crie no n8n um <em>Schedule Trigger</em> + HTTP Request com o header{' '}
                <code className="tipo-dado text-[12px]">Authorization: Bearer CRON_SECRET</code>.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* API */}
        <Card>
          <CardHeader
            titulo="API REST /api/v1 (n8n, App próprio, automações)"
            descricao="Autenticação: header Authorization: Bearer INTEGRATIONS_API_KEY."
            acoes={<Status ok={Boolean(envServidor.apiKey)} sim="Chave configurada" nao="Falta INTEGRATIONS_API_KEY" />}
          />
          <Table>
            <THead>
              <TR>
                <TH>Método</TH>
                <TH>Rota</TH>
                <TH>O que faz</TH>
              </TR>
            </THead>
            <TBody>
              <Endpoint metodo="GET" caminho="/api/v1/clientes?whatsapp=&email=&q=" descricao="Busca clientes" />
              <Endpoint metodo="POST" caminho="/api/v1/clientes" descricao="Cria ou atualiza cliente pelo WhatsApp" />
              <Endpoint metodo="GET" caminho="/api/v1/pedidos?status_pagamento=&canal=&pre_venda=&desde=" descricao="Lista pedidos com itens" />
              <Endpoint metodo="GET" caminho="/api/v1/pedidos/{id}" descricao="Pedido completo (cliente, itens, endereço)" />
              <Endpoint metodo="PATCH" caminho="/api/v1/pedidos/{id}" descricao="Atualiza status / pagamento (ex.: PIX confirmado)" />
              <Endpoint metodo="POST" caminho="/api/v1/pedidos/{id}/cobranca" descricao="Registra cobrança enviada por automação" />
              <Endpoint metodo="GET" caminho="/api/v1/pre-vendas?status=ativa" descricao="Pré-vendas com link público" />
              <Endpoint metodo="GET" caminho="/api/v1/produtos" descricao="Catálogo de cervejas" />
            </TBody>
          </Table>
          <CardContent className="pt-4 text-[13px] text-suave">
            Base: <code className="tipo-dado">{site}/api/v1</code> · Documentação completa no README.
          </CardContent>
        </Card>
      </div>
    </>
  )
}
