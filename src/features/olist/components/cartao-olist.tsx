import { Check, Link2, RefreshCw, RotateCcw, Send, Unplug } from 'lucide-react'
import Link from 'next/link'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, classesBotao } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Codigo, Dado, Dados, Passos, SomenteAdmin, UrlCopiavel, ZonaDeRisco } from '@/features/configuracoes/components/blocos'
import { formatarDataHora, formatarHaQuanto, formatarNumero } from '@/lib/format'

import { desconectarOlist, enviarEstoqueOlistAgora, resolverLancamentoOlist, sincronizarOlistAgora } from '../actions'
import type { ResumoEstoqueOlist, StatusOlist } from '../queries'

/** Mensagens do retorno do OAuth (?olist=...). */
export const AVISOS_OLIST: Record<string, { tom: 'sucesso' | 'erro' | 'alerta'; texto: string }> = {
  conectado: { tom: 'sucesso', texto: 'Olist conectado! Importando o histórico de vendas (13 meses) — leva alguns segundos.' },
  cancelado: { tom: 'alerta', texto: 'A conexão foi cancelada na tela do Olist.' },
  'erro-estado': { tom: 'erro', texto: 'Não foi possível validar o retorno do Olist (sessão expirada). Clique em Conectar de novo.' },
  'erro-token': {
    tom: 'erro',
    texto: 'O Olist recusou a conexão. Confira o Client ID/Secret na Vercel e se a URL de redirecionamento do aplicativo é exatamente a mostrada no passo a passo.',
  },
  'apenas-admin': { tom: 'alerta', texto: 'Apenas administradores conectam o Olist.' },
  'sem-credenciais': { tom: 'alerta', texto: 'Configure OLIST_CLIENT_ID e OLIST_CLIENT_SECRET na Vercel antes de conectar.' },
}

/** Situação do Olist em uma etiqueta (cabeçalho da seção e visão geral). */
export function situacaoOlist(status: StatusOlist): { tom: 'sucesso' | 'alerta' | 'perigo'; rotulo: string } {
  if (status.conectado) return { tom: 'sucesso', rotulo: 'Conectado' }
  if (status.expirada) return { tom: 'perigo', rotulo: 'Conexão expirada' }
  return { tom: 'alerta', rotulo: status.configurado ? 'Não conectado' : 'Falta configurar' }
}

export function SeloOlist({ status }: { status: StatusOlist }) {
  const { tom, rotulo } = situacaoOlist(status)
  return <Badge tom={tom} ponto>{rotulo}</Badge>
}

function BotaoConectar({ status }: { status: StatusOlist }) {
  const rotulo = status.conectado || status.expirada ? 'Reconectar' : 'Conectar Olist'
  if (!status.configurado) {
    return (
      <Button tamanho="sm" variante="primario" disabled title="Disponível depois de cadastrar as chaves na Vercel e fazer o redeploy">
        <Link2 /> {rotulo}
      </Button>
    )
  }
  return (
    // <a> (e não <Link>): a rota redireciona para fora do CRM e não deve ser pré-carregada.
    <a href="/api/olist/conectar" className={classesBotao({ variante: status.conectado ? 'secundario' : 'primario', tamanho: 'sm' })}>
      <Link2 /> {rotulo}
    </a>
  )
}

/** Conexão com o Olist ERP (API v3): situação e ações do dia a dia. */
export function ConexaoOlist({ status, ehAdmin }: { status: StatusOlist; ehAdmin: boolean }) {
  return (
    <Card>
      <CardHeader
        titulo="Conexão"
        descricao="Vendas do Mercado Livre, Shopee e Loja Virtual (Shopify) para o painel “Vendas por canal” e o estoque das cervejas das pré-vendas."
      />
      <CardContent className="space-y-4 text-sm">
        {status.conectado ? (
          <Dados>
            <Dado rotulo="Conectado em">{formatarDataHora(status.conectadoEm)}</Dado>
            <Dado rotulo="Última sincronização">
              {status.ultimaSincronizacao ? formatarHaQuanto(status.ultimaSincronizacao) : 'importando o histórico…'}
            </Dado>
            <Dado rotulo="Atualização automática" largo>
              a cada 4 h e ao abrir a Visão geral
            </Dado>
          </Dados>
        ) : status.expirada ? (
          <Alert tom="erro" titulo="A conexão expirou">
            O Olist exige renovar o acesso pelo menos 1x por dia e a renovação automática não ocorreu. Clique em Reconectar — os
            pedidos já importados continuam guardados.
          </Alert>
        ) : (
          <p className="text-suave">
            {status.configurado
              ? 'As chaves do aplicativo já estão no servidor. Falta autorizar o CRM na conta do Olist.'
              : 'Ainda não conectado. Siga o passo a passo abaixo para criar o aplicativo no Olist.'}
          </p>
        )}

        {status.conectado && status.ultimoErro && (
          <Alert tom="alerta" titulo="A última sincronização falhou">
            {status.ultimoErro}
          </Alert>
        )}
        {!status.sincronizacaoDisponivel && (
          <Alert tom="alerta" titulo="Falta CRON_SECRET">
            A sincronização automática usa a rota <Codigo>/api/cron/olist</Codigo>, protegida por <Codigo>CRON_SECRET</Codigo>. Gere
            um valor com <Codigo>openssl rand -hex 32</Codigo> e cadastre na Vercel.
          </Alert>
        )}

        {(ehAdmin || status.conectado) && (
          <div className="flex flex-wrap gap-2">
            {status.conectado && (
              <ActionButton acao={sincronizarOlistAgora} tamanho="sm">
                <RefreshCw /> Sincronizar agora
              </ActionButton>
            )}
            {ehAdmin && <BotaoConectar status={status} />}
          </div>
        )}
        {!ehAdmin && !status.conectado && <SomenteAdmin>Peça a um administrador para conectar o Olist.</SomenteAdmin>}
      </CardContent>
    </Card>
  )
}

/** Passo a passo para criar o aplicativo no Olist (com a URL de redirecionamento para copiar). Sem moldura: a página decide o cartão. */
export function GuiaOlist({ status, site }: { status: StatusOlist; site: string }) {
  const redirectUri = `${site}/api/olist/callback`

  return (
    <div className="space-y-4">
      <Passos
        passos={[
          {
            titulo: 'Crie o aplicativo no Olist',
            conteudo: (
              <>
                Em <strong>Menu › Configurações › aba Geral › Aplicativos › + novo aplicativo</strong>. Em permissões, marque{' '}
                <strong>Leitura</strong> em <strong>Pedidos</strong> e <strong>Produtos</strong>, e <strong>Leitura e Escrita</strong> em{' '}
                <strong>Estoque</strong>.
              </>
            ),
          },
          {
            titulo: 'Use esta URL de redirecionamento',
            conteudo: (
              <>
                Tem que ser idêntica:
                <UrlCopiavel rotulo="URL de redirecionamento" valor={redirectUri} className="mt-2" />
              </>
            ),
          },
          {
            titulo: 'Cadastre as chaves na Vercel',
            conteudo: (
              <>
                Copie o Client ID e o Client Secret do aplicativo (botão “detalhes” no Olist) para a Vercel, em{' '}
                <strong>Settings › Environment Variables</strong>, ambiente <strong>Production</strong>. Depois faça um{' '}
                <strong>Redeploy</strong> e o botão Conectar é liberado.
              </>
            ),
          },
          {
            titulo: 'Clique em Conectar Olist',
            conteudo: <>Na Conexão, acima. A primeira sincronização importa 13 meses de histórico.</>,
          },
        ]}
      />
      {!status.configurado && (
        <Alert tom="alerta" titulo="O servidor ainda não encontrou:">
          {status.variaveisFaltando.map((nome, i) => (
            <span key={nome}>
              {i > 0 && ' e '}
              <Codigo>{nome}</Codigo>
            </span>
          ))}
          . Se você já cadastrou, confira o nome (exatamente assim, em maiúsculas), se marcou Production e se fez o Redeploy
          depois de salvar.
        </Alert>
      )}
    </div>
  )
}

/** Estoque das pré-vendas: fila de lançamentos e os que precisam de alguém. */
export function EstoqueOlist({ status, estoque, ehAdmin }: { status: StatusOlist; estoque: ResumoEstoqueOlist; ehAdmin: boolean }) {
  return (
    <Card>
      <div id="estoque-olist" className="scroll-mt-24" />
      <CardHeader
        titulo="Estoque das pré-vendas"
        descricao="Cada cerveja que entra numa Caixa VIP baixa o estoque na Olist; cancelamento, exclusão e caixa vencida devolvem."
        acoes={
          <ActionButton acao={enviarEstoqueOlistAgora} tamanho="sm">
            <Send /> Enviar fila agora
          </ActionButton>
        }
      />
      <CardContent className="space-y-4 text-sm">
        <Dados>
          <Dado rotulo="Cervejas vinculadas">
            <span className="tipo-dado">{formatarNumero(estoque.produtosVinculados)}</span>
          </Dado>
          <Dado rotulo="Lançamentos na fila">
            <span className="tipo-dado">{estoque.naFila ? `${formatarNumero(estoque.naFila)} (envio em instantes)` : 'nenhum'}</span>
          </Dado>
          <Dado rotulo="Última leitura do estoque" largo>
            {estoque.ultimaLeitura ? formatarHaQuanto(estoque.ultimaLeitura) : '—'}
          </Dado>
        </Dados>

        {status.erroEstoque && (
          <Alert tom="alerta" titulo="A Olist recusou o último pedido de estoque">
            {status.erroEstoque}
          </Alert>
        )}

        {estoque.problemas.length > 0 && (
          <div className="rounded-xl border border-alerta/30">
            <p className="border-b border-alerta/20 bg-alerta-50 px-4 py-2.5 text-[13px] font-semibold text-alerta">
              {estoque.problemas.length} lançamento(s) precisam de você
            </p>
            <ul className="divide-y divide-linha">
              {estoque.problemas.map((m) => (
                <li key={m.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[14px] font-semibold">
                      {m.tipo === 'S' ? 'Saída' : 'Entrada'} de {formatarNumero(m.quantidade)} · {m.produto}
                    </p>
                    <Badge tom={m.status === 'erro' ? 'perigo' : 'alerta'} ponto>
                      {m.status === 'erro' ? 'Recusado pela Olist' : 'Conferir na Olist'}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-suave">
                    {m.pedidoNumero && m.pedidoId ? (
                      <Link href={`/pedidos/${m.pedidoId}`} className="font-semibold text-volt-700 hover:text-ink">
                        #PRM-{m.pedidoNumero}
                      </Link>
                    ) : (
                      'Pedido excluído'
                    )}{' '}
                    · {formatarDataHora(m.criadoEm)}
                    {m.erro ? ` · ${m.erro}` : ''}
                  </p>
                  {ehAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton acao={resolverLancamentoOlist.bind(null, m.id, 'reenviar')} tamanho="sm">
                        <RotateCcw /> {m.status === 'erro' ? 'Tentar de novo' : 'Não entrou: lançar'}
                      </ActionButton>
                      <ActionButton
                        acao={resolverLancamentoOlist.bind(null, m.id, 'ignorar')}
                        tamanho="sm"
                        confirmar="Marcar como resolvido? O CRM não envia este lançamento; confira que o estoque na Olist está certo."
                      >
                        <Check /> {m.status === 'erro' ? 'Já acertei na Olist' : 'Já entrou na Olist'}
                      </ActionButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Aviso de estoque (webhook da Olist → CRM). A URL leva a chave secreta: só administradores veem. */
export function AvisoEstoqueOlist({ webhook }: { webhook: string | null }) {
  return (
    <Card>
      <CardHeader
        titulo="Aviso de estoque da Olist"
        descricao="Recomendado: uma venda no Mercado Livre ou na Shopee atualiza o estoque do link na hora. Sem ele, o CRM confere a cada 5 min."
      />
      <CardContent className="space-y-3 text-sm">
        <p>
          Na Olist, instale o aplicativo <strong>Webhooks</strong> e em{' '}
          <strong>Menu › Configurações › Geral › Outras configurações › Webhooks</strong>, ative <strong>Lançamentos de estoque</strong>{' '}
          com esta URL:
        </p>
        {webhook ? (
          <UrlCopiavel rotulo="URL do aviso de estoque" valor={webhook} />
        ) : (
          <Alert tom="alerta">Falta CRON_SECRET na Vercel para gerar a URL.</Alert>
        )}
        <p className="text-[13px] text-suave">
          O aplicativo do CRM na Olist precisa de <strong className="text-ink">Produtos</strong> (leitura) e{' '}
          <strong className="text-ink">Estoque</strong> (leitura e escrita). Se você mudou as permissões, clique em Reconectar.
        </p>
      </CardContent>
    </Card>
  )
}

export function DesconectarOlist() {
  return (
    <ZonaDeRisco
      titulo="Desconectar o Olist"
      descricao="As vendas já importadas continuam no CRM, mas param de ser atualizadas."
    >
      <ActionButton
        acao={desconectarOlist}
        variante="perigo"
        tamanho="sm"
        confirmar="Desconectar o Olist? As vendas já importadas continuam no CRM, mas param de ser atualizadas."
      >
        <Unplug /> Desconectar
      </ActionButton>
    </ZonaDeRisco>
  )
}
