import { Link2, RefreshCw, Unplug } from 'lucide-react'
import type { ReactNode } from 'react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, classesBotao } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { diasDesde } from '@/lib/datas'
import { formatarData, formatarDataHora } from '@/lib/format'

import { desconectarMarketplace, testarConexaoMarketplace } from '../actions'
import { MARKETPLACES, type IdMarketplace, type StatusMarketplace } from '../canais'
import { FormularioCredenciais } from './formulario-credenciais'

/** A Shopee pede nova autorização a cada 365 dias: avisa com esta antecedência. */
const DIAS_AVISO_AUTORIZACAO = 30

const CAMPOS: Record<IdMarketplace, { rotuloId: string; dicaId: string; rotuloSegredo: string; dicaSegredo: string }> = {
  mercado_livre: {
    rotuloId: 'Client ID (ID do app)',
    dicaId: 'DevCenter › Minhas aplicações › seu app',
    rotuloSegredo: 'Client Secret (Secret Key)',
    dicaSegredo: 'Na mesma tela, em Mostrar.',
  },
  shopee: {
    rotuloId: 'Live Partner ID',
    dicaId: 'Console › App List › seu app › App Key (o Live, não o Test)',
    rotuloSegredo: 'Live Partner Key',
    dicaSegredo: 'Na mesma tela, a Live Key — liberada após o Go Live.',
  },
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="tipo-rotulo text-suave">{rotulo}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  )
}

/** Conexão com um marketplace: conta autorizada, ações e o formulário com os dados do app. */
export function CartaoMarketplace({
  canal,
  status,
  descricao,
  ehAdmin,
}: {
  canal: IdMarketplace
  status: StatusMarketplace
  descricao: string
  ehAdmin: boolean
}) {
  const { nome, slug } = MARKETPLACES[canal]
  // diasDesde é positivo para o passado: negativo aqui = dias que faltam.
  const diasParaVencer = status.autorizacao_expira_em ? -(diasDesde(status.autorizacao_expira_em) ?? 0) : null
  const venceLogo = diasParaVencer !== null && diasParaVencer <= DIAS_AVISO_AUTORIZACAO

  const selo = status.conectado ? (
    status.ultimo_erro ? (
      <Badge tom="perigo" ponto>Com erro</Badge>
    ) : (
      <Badge tom="sucesso" ponto>Conectado</Badge>
    )
  ) : status.configurado ? (
    <Badge tom="alerta" ponto>{status.ultimo_erro ? 'Reconectar' : 'Pronto para conectar'}</Badge>
  ) : (
    <Badge tom="alerta" ponto>Falta configurar</Badge>
  )

  const rotuloConectar = status.conectado || status.ultimo_erro ? 'Reconectar' : `Conectar ${nome}`
  const botaoConectar = !ehAdmin ? null : status.configurado ? (
    // <a> (e não <Link>): a rota redireciona para fora do CRM e não deve ser pré-carregada.
    <a
      href={`/api/marketplaces/${slug}/conectar`}
      className={classesBotao({ variante: status.conectado ? 'secundario' : 'primario', tamanho: 'sm' })}
    >
      <Link2 /> {rotuloConectar}
    </a>
  ) : (
    <Button tamanho="sm" variante="primario" disabled title="Disponível depois de salvar os dados do app">
      <Link2 /> {rotuloConectar}
    </Button>
  )

  return (
    <Card>
      <CardHeader titulo={nome} descricao={descricao} acoes={selo} />
      <CardContent className="space-y-4">
        {status.conectado && (
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-papel p-4 text-[14px] sm:grid-cols-4">
            <Dado rotulo={canal === 'shopee' ? 'Loja' : 'Conta'}>{status.conta_nome ?? status.conta_id ?? '—'}</Dado>
            <Dado rotulo="Conectado em">{formatarDataHora(status.conectado_em)}</Dado>
            <Dado rotulo="Último teste">{status.verificado_em ? formatarDataHora(status.verificado_em) : '—'}</Dado>
            <Dado rotulo={canal === 'shopee' ? 'Autorização vale até' : 'Renovação'}>
              {canal === 'shopee' ? (
                status.autorizacao_expira_em ? (
                  <span className={venceLogo ? 'font-semibold text-perigo' : undefined}>{formatarData(status.autorizacao_expira_em)}</span>
                ) : (
                  '—'
                )
              ) : (
                'automática, todo dia'
              )}
            </Dado>
          </dl>
        )}

        {status.conectado && venceLogo && (
          <Alert tom="alerta" titulo="A autorização da loja está perto de vencer">
            A Shopee libera o acesso por no máximo 365 dias. Clique em Reconectar e autorize de novo por 365 dias.
          </Alert>
        )}
        {status.ultimo_erro && (
          <Alert tom="erro" titulo={status.conectado ? `O ${nome} recusou a última conferência` : 'A conexão não foi concluída'}>
            {status.ultimo_erro}
          </Alert>
        )}

        {(botaoConectar || status.conectado) && (
          <div className="flex flex-wrap items-center gap-2">
            {botaoConectar}
            {status.conectado && (
              <ActionButton acao={testarConexaoMarketplace.bind(null, canal)}>
                <RefreshCw /> Testar conexão
              </ActionButton>
            )}
            {ehAdmin && status.conectado && (
              <ActionButton
                acao={desconectarMarketplace.bind(null, canal)}
                variante="perigo"
                confirmar={`Desconectar o ${nome}? O CRM para de ler as vendas desse canal até conectar de novo.`}
              >
                <Unplug /> Desconectar
              </ActionButton>
            )}
          </div>
        )}

        {ehAdmin ? (
          status.configurado ? (
            <details className="group rounded-xl border border-linha">
              <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-semibold hover:bg-papel/60 [&::-webkit-details-marker]:hidden">
                Trocar ID ou chave do app
              </summary>
              <div className="border-t border-linha p-4">
                <FormularioCredenciais canal={canal} status={status} {...CAMPOS[canal]} />
              </div>
            </details>
          ) : (
            <FormularioCredenciais canal={canal} status={status} {...CAMPOS[canal]} />
          )
        ) : (
          !status.conectado && <p className="text-[13px] text-suave">Um administrador precisa colar os dados do app e conectar.</p>
        )}
      </CardContent>
    </Card>
  )
}
