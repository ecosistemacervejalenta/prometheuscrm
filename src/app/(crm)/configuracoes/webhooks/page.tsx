import type { Metadata } from 'next'
import { Pause, Play, RefreshCw, Send, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
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
import { Codigo, Pilha, UrlCopiavel } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { FormularioWebhook } from '@/features/configuracoes/components/formularios'
import { listarEventosRecentes, listarWebhooks } from '@/features/configuracoes/queries'
import { envServidor } from '@/lib/env.server'
import { formatarDataCurta, formatarHora } from '@/lib/format'
import type { Tom } from '@/lib/rotulos'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'Webhooks' }

const TOM_EVENTO: Record<string, Tom> = { pendente: 'alerta', enviado: 'sucesso', erro: 'perigo', ignorado: 'neutro' }

export default async function PaginaWebhooks() {
  const [webhooks, eventos, site] = await Promise.all([listarWebhooks(), listarEventosRecentes(), urlDoSite()])
  const ativos = webhooks.filter((w) => w.ativo).length
  const comErro = eventos.filter((e) => e.status === 'erro').length
  const cronOk = Boolean(envServidor.cronSecret)

  return (
    <>
      <CabecalhoSecao
        secao="webhooks"
        selo={
          webhooks.length === 0 ? (
            <Badge ponto>Nenhum destino</Badge>
          ) : (
            <Badge tom={ativos > 0 ? 'sucesso' : 'alerta'} ponto>
              {ativos} de {webhooks.length} ativo(s)
            </Badge>
          )
        }
      />
      <Pilha>
        {/* Destinos cadastrados */}
        <Card>
          <CardHeader
            titulo="Destinos"
            descricao="Cada evento do CRM é enviado por POST com assinatura HMAC-SHA256 no header X-Prometheus-Assinatura."
          />
          {webhooks.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-suave lg:px-5 lg:pb-6">Nenhum webhook cadastrado ainda. Adicione o primeiro logo abaixo.</p>
          ) : (
            <>
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
                        <p className="tipo-dado max-w-[200px] truncate text-[12px] text-suave" title={w.url}>{w.url}</p>
                      </TD>
                      <TD>
                        <div className="flex max-w-[190px] flex-wrap gap-1">
                          {w.eventos.map((e) => <Badge key={e}>{e === '*' ? 'todos' : e}</Badge>)}
                        </div>
                      </TD>
                      <TD>
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
            </>
          )}
        </Card>

        {/* Novo destino */}
        <Card>
          <CardHeader titulo="Adicionar webhook" descricao="n8n, Zapier, App próprio ou qualquer endereço que receba POST." />
          <CardContent>
            <FormularioWebhook />
          </CardContent>
        </Card>

        {/* Fila de eventos */}
        <Card>
          <CardHeader
            titulo="Fila de eventos"
            descricao="Os 15 eventos mais recentes. São entregues logo após cada ação e, como garantia, pela rotina de reenvio."
            acoes={
              <>
                {comErro > 0 && <Badge tom="perigo" ponto>{comErro} com erro</Badge>}
                <ActionButton acao={processarFilaAgora}><RefreshCw /> Processar agora</ActionButton>
              </>
            }
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
                    <TH>Status</TH>
                    <TH>Detalhe</TH>
                    <TH className="text-right">Ação</TH>
                  </TR>
                </THead>
                <TBody>
                  {eventos.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <p className="tipo-dado text-[13px]">{e.tipo}</p>
                        <p className="tipo-dado text-[12px] text-suave">{formatarDataCurta(e.criado_em)} {formatarHora(e.criado_em)}</p>
                      </TD>
                      <TD><Badge tom={TOM_EVENTO[e.status] ?? 'neutro'} ponto>{e.status}</Badge></TD>
                      <TD className="max-w-[260px] truncate text-[12px] text-suave" title={e.ultimo_erro ?? undefined}>
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

        {/* Rotina de reenvio */}
        <Card className="max-w-3xl">
          <CardHeader
            titulo="Rotina de reenvio (cron)"
            descricao="Garante a entrega dos eventos que falharam."
            acoes={cronOk ? <Badge tom="sucesso" ponto>CRON_SECRET ok</Badge> : <Badge tom="alerta" ponto>Falta CRON_SECRET</Badge>}
          />
          <CardContent className="space-y-3 text-sm">
            <UrlCopiavel rotulo="Rota (GET)" valor={`${site}/api/cron/eventos`} />
            <p className="text-suave">
              A Vercel chama essa rota pelo <Codigo>vercel.ts</Codigo>. No plano Hobby o cron é diário — para reenvio a cada minuto, crie
              no n8n um <em>Schedule Trigger</em> + HTTP Request com o header <Codigo>Authorization: Bearer CRON_SECRET</Codigo>.
            </p>
          </CardContent>
        </Card>
      </Pilha>
    </>
  )
}
