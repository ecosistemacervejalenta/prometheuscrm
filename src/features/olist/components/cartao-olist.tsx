import { Link2, RefreshCw, Unplug } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { classesBotao } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { formatarDataHora, formatarHaQuanto } from '@/lib/format'

import { desconectarOlist, sincronizarOlistAgora } from '../actions'
import type { StatusOlist } from '../queries'

/** Mensagens do retorno do OAuth (?olist=...). */
export const AVISOS_OLIST: Record<string, { tom: 'sucesso' | 'erro' | 'alerta'; texto: string }> = {
  conectado: { tom: 'sucesso', texto: 'Olist conectado! Importando o histórico de vendas (13 meses) — leva alguns segundos.' },
  cancelado: { tom: 'alerta', texto: 'A conexão foi cancelada na tela do Olist.' },
  'erro-estado': { tom: 'erro', texto: 'Não foi possível validar o retorno do Olist (sessão expirada). Clique em Conectar de novo.' },
  'erro-token': {
    tom: 'erro',
    texto: 'O Olist recusou a conexão. Confira o Client ID/Secret na Vercel e se a URL de redirecionamento do aplicativo é exatamente a mostrada abaixo.',
  },
  'apenas-admin': { tom: 'alerta', texto: 'Apenas administradores conectam o Olist.' },
  'sem-credenciais': { tom: 'alerta', texto: 'Configure OLIST_CLIENT_ID e OLIST_CLIENT_SECRET na Vercel antes de conectar.' },
}

function Codigo({ children }: { children: string }) {
  return <code className="tipo-dado text-[12px]">{children}</code>
}

/** Conexão com o Olist ERP (API v3): configuração, status e ações. */
export function CartaoOlist({ status, site, ehAdmin }: { status: StatusOlist; site: string; ehAdmin: boolean }) {
  const redirectUri = `${site}/api/olist/callback`
  const selo = status.conectado ? (
    <Badge tom="sucesso" ponto>Conectado</Badge>
  ) : status.expirada ? (
    <Badge tom="perigo" ponto>Conexão expirada</Badge>
  ) : status.configurado ? (
    <Badge tom="alerta" ponto>Não conectado</Badge>
  ) : (
    <Badge tom="alerta" ponto>Falta configurar</Badge>
  )

  const botaoConectar = ehAdmin && status.configurado && (
    // <a> (e não <Link>): a rota redireciona para fora do CRM e não deve ser pré-carregada.
    <a href="/api/olist/conectar" className={classesBotao({ variante: status.conectado ? 'secundario' : 'primario', tamanho: 'sm' })}>
      <Link2 /> {status.conectado || status.expirada ? 'Reconectar' : 'Conectar Olist'}
    </a>
  )

  return (
    <Card>
      <CardHeader
        titulo="Olist ERP (API v3)"
        descricao="Vendas do Mercado Livre, Shopee e Loja Virtual (Shopify) para o painel “Vendas por canal”. Somente leitura."
        acoes={selo}
      />
      <CardContent className="space-y-4 text-sm">
        {status.conectado ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="tipo-rotulo text-suave">Conectado em</dt>
              <dd className="mt-0.5">{formatarDataHora(status.conectadoEm)}</dd>
            </div>
            <div>
              <dt className="tipo-rotulo text-suave">Última sincronização</dt>
              <dd className="mt-0.5">
                {status.ultimaSincronizacao ? formatarHaQuanto(status.ultimaSincronizacao) : 'importando o histórico…'}
              </dd>
            </div>
            <div>
              <dt className="tipo-rotulo text-suave">Atualização automática</dt>
              <dd className="mt-0.5">a cada 4 h e ao abrir a Visão geral</dd>
            </div>
          </dl>
        ) : status.expirada ? (
          <Alert tom="erro" titulo="A conexão expirou">
            O Olist exige renovar o acesso pelo menos 1x por dia e a renovação automática não ocorreu. Clique em Reconectar —
            os pedidos já importados continuam guardados.
          </Alert>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-suave marker:text-ink">
            <li>
              No Olist: <strong className="text-ink">Menu › Configurações › aba Geral › Aplicativos › + novo aplicativo</strong>. Em
              permissões, marque só <strong className="text-ink">Leitura</strong> em <strong className="text-ink">Pedidos</strong>.
            </li>
            <li>Use esta URL de redirecionamento (tem que ser idêntica):</li>
          </ol>
        )}

        {status.conectado && status.ultimoErro && (
          <Alert tom="alerta" titulo="A última sincronização falhou">
            {status.ultimoErro}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
          <span className="tipo-rotulo w-full text-suave">URL de redirecionamento</span>
          <code className="tipo-dado flex-1 text-[13px] break-all">{redirectUri}</code>
          <CopyButton texto={redirectUri} />
        </div>

        {!status.configurado && (
          <p className="text-suave">
            3. Copie o Client ID e o Client Secret do aplicativo para a Vercel (<Codigo>OLIST_CLIENT_ID</Codigo> e{' '}
            <Codigo>OLIST_CLIENT_SECRET</Codigo>) e faça um novo deploy. Depois volte aqui e clique em Conectar.
          </p>
        )}
        {!status.sincronizacaoDisponivel && (
          <Alert tom="alerta" titulo="Falta CRON_SECRET">
            A sincronização automática usa a rota <Codigo>/api/cron/olist</Codigo>, protegida por <Codigo>CRON_SECRET</Codigo>.
            Gere um valor com <Codigo>openssl rand -hex 32</Codigo> e cadastre na Vercel.
          </Alert>
        )}

        {(botaoConectar || status.conectado) && (
          <div className="flex flex-wrap gap-2">
            {status.conectado && (
              <ActionButton acao={sincronizarOlistAgora} tamanho="sm">
                <RefreshCw /> Sincronizar agora
              </ActionButton>
            )}
            {botaoConectar}
            {ehAdmin && (status.conectado || status.expirada) && (
              <ActionButton
                acao={desconectarOlist}
                variante="perigo"
                tamanho="sm"
                confirmar="Desconectar o Olist? As vendas já importadas continuam no CRM, mas param de ser atualizadas."
              >
                <Unplug /> Desconectar
              </ActionButton>
            )}
          </div>
        )}
        {!ehAdmin && !status.conectado && status.configurado && (
          <p className="text-[13px] text-suave">Peça a um administrador para conectar o Olist.</p>
        )}
      </CardContent>
    </Card>
  )
}
