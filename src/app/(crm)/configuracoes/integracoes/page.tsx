import type { Metadata } from 'next'
import { Pause, Play, RefreshCw, Send, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { ListaMobile } from '@/components/ui/lista-mobile'
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
import { CartaoWhatsapp } from '@/features/atendimento/components/cartao-whatsapp'
import { configAtendimento, statusWhatsapp } from '@/features/atendimento/queries'
import { AVISOS_OLIST, CartaoOlist } from '@/features/olist/components/cartao-olist'
import { statusOlist } from '@/features/olist/queries'
import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import { formatarDataCurta, formatarHora } from '@/lib/format'
import type { Tom } from '@/lib/rotulos'
import { urlDoSite } from '@/lib/url'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Integrações' }

const TOM_EVENTO: Record<string, Tom> = { pendente: 'alerta', enviado: 'sucesso', erro: 'perigo', ignorado: 'neutro' }

const ENDPOINTS = [
  { metodo: 'GET', caminho: '/api/v1/clientes?whatsapp=&email=&q=', descricao: 'Busca clientes' },
  { metodo: 'POST', caminho: '/api/v1/clientes', descricao: 'Cria ou atualiza cliente pelo WhatsApp' },
  { metodo: 'GET', caminho: '/api/v1/pedidos?status_pagamento=&canal=&pre_venda=&desde=', descricao: 'Lista pedidos com itens' },
  { metodo: 'GET', caminho: '/api/v1/pedidos/{id}', descricao: 'Pedido completo (cliente, itens, endereço)' },
  { metodo: 'PATCH', caminho: '/api/v1/pedidos/{id}', descricao: 'Atualiza status / pagamento (ex.: PIX confirmado)' },
  { metodo: 'POST', caminho: '/api/v1/pedidos/{id}/cobranca', descricao: 'Registra cobrança enviada por automação' },
  { metodo: 'GET', caminho: '/api/v1/pre-vendas?status=ativa', descricao: 'Pré-vendas com link público' },
  { metodo: 'GET', caminho: '/api/v1/produtos', descricao: 'Catálogo de cervejas' },
]

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

export default async function PaginaIntegracoes({ searchParams }: PageProps<'/configuracoes/integracoes'>) {
  const { perfil } = await exigirEquipe()
  const aviso = AVISOS_OLIST[param((await searchParams).olist) ?? '']
  const [webhooks, eventos, site, olist, whatsapp, configWhatsapp] = await Promise.all([
    listarWebhooks(),
    listarEventosRecentes(),
    urlDoSite(),
    statusOlist(),
    statusWhatsapp(),
    configAtendimento(),
  ])

  return (
    <>
      <CabecalhoConfiguracoes ativa="integracoes" />

      <div className="space-y-5 lg:space-y-6">
        {aviso && <Alert tom={aviso.tom}>{aviso.texto}</Alert>}

        {/* WhatsApp (uazapi) */}
        <CartaoWhatsapp status={whatsapp} config={configWhatsapp} ehAdmin={perfil.papel === 'admin'} />

        {/* Olist ERP */}
        <CartaoOlist status={olist} site={site} ehAdmin={perfil.papel === 'admin'} />

        {/* n8n / webhooks de saída */}
        <Card>
          <CardHeader
            titulo="Webhooks de saída (n8n, Zapier, App)"
            descricao="Cada evento do CRM é enviado por POST com assinatura HMAC-SHA256 no header X-Prometheus-Assinatura."
          />
          {webhooks.length > 0 && (
            <ListaMobile>
              {webhooks.map((w) => (
                <li key={w.id} className={w.ativo ? 'px-4 py-3' : 'px-4 py-3 opacity-60'}>
                  <p className="text-[15px] font-semibold">{w.nome} {!w.ativo && <Badge>Pausado</Badge>}</p>
                  <p className="tipo-dado truncate text-[12px] text-suave">{w.url}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {w.eventos.map((e) => <Badge key={e}>{e === '*' ? 'todos' : e}</Badge>)}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 *:w-full">
                    <span className="col-span-2"><CopyButton texto={w.segredo} rotulo="Segredo" /></span>
                    <ActionButton acao={testarWebhook.bind(null, w.id)} titulo="Testar"><Send /></ActionButton>
                    <ActionButton acao={alternarWebhook.bind(null, w.id, !w.ativo)} titulo={w.ativo ? 'Pausar' : 'Ativar'}>
                      {w.ativo ? <Pause /> : <Play />}
                    </ActionButton>
                  </div>
                  <div className="mt-2">
                    <ActionButton acao={excluirWebhook.bind(null, w.id)} variante="perigo" confirmar={`Excluir o webhook ${w.nome}?`} className="w-full">
                      <Trash2 /> Excluir
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ListaMobile>
          )}
          {webhooks.length > 0 && (
            <Table somenteDesktop>
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
          <CardContent className="border-t border-linha pt-4 lg:pt-5">
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
            <p className="px-4 pb-5 text-sm text-suave lg:px-5 lg:pb-6">Nenhum evento registrado ainda.</p>
          ) : (
            <>
            <ListaMobile>
              {eventos.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="tipo-dado truncate text-[13px] font-semibold">{e.tipo}</p>
                    <p className="truncate text-[12px] text-suave">
                      {formatarDataCurta(e.criado_em)} {formatarHora(e.criado_em)}
                      {e.ultimo_erro ? ` · ${e.ultimo_erro}` : e.tentativas > 0 ? ` · ${e.tentativas} tentativa(s)` : ''}
                    </p>
                  </div>
                  <Badge tom={TOM_EVENTO[e.status] ?? 'neutro'} ponto>{e.status}</Badge>
                  {(e.status === 'erro' || e.status === 'ignorado') && (
                    <ActionButton acao={reenviarEvento.bind(null, e.id)}>Reenviar</ActionButton>
                  )}
                </li>
              ))}
            </ListaMobile>
            <Table somenteDesktop>
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
            </>
          )}
        </Card>

        <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
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
          <ListaMobile>
            {ENDPOINTS.map((e) => (
              <li key={e.metodo + e.caminho} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tom={e.metodo === 'GET' ? 'shopify' : e.metodo === 'POST' ? 'volt' : 'app'}>{e.metodo}</Badge>
                  <span className="text-[13px] text-suave">{e.descricao}</span>
                </div>
                <p className="tipo-dado mt-1 text-[12px] break-all">{e.caminho}</p>
              </li>
            ))}
          </ListaMobile>
          <Table somenteDesktop>
            <THead>
              <TR>
                <TH>Método</TH>
                <TH>Rota</TH>
                <TH>O que faz</TH>
              </TR>
            </THead>
            <TBody>
              {ENDPOINTS.map((e) => (
                <Endpoint key={e.metodo + e.caminho} metodo={e.metodo} caminho={e.caminho} descricao={e.descricao} />
              ))}
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
