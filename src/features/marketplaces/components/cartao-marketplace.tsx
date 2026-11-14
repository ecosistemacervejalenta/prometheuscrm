import { Link2, RefreshCw, Unplug } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, classesBotao } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dado, Dados, SomenteAdmin, ZonaDeRisco } from '@/features/configuracoes/components/blocos'
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

/** Situação da conexão em uma etiqueta (cabeçalho da seção e visão geral). */
export function situacaoMarketplace(status: StatusMarketplace): { tom: 'sucesso' | 'alerta' | 'perigo'; rotulo: string } {
  if (status.conectado) return status.ultimo_erro ? { tom: 'perigo', rotulo: 'Com erro' } : { tom: 'sucesso', rotulo: 'Conectado' }
  if (!status.configurado) return { tom: 'alerta', rotulo: 'Não conectado' }
  return { tom: 'alerta', rotulo: status.ultimo_erro ? 'Reconectar' : 'Pronto para conectar' }
}

export function SeloMarketplace({ status }: { status: StatusMarketplace }) {
  const { tom, rotulo } = situacaoMarketplace(status)
  return <Badge tom={tom} ponto>{rotulo}</Badge>
}

/** Conta autorizada no marketplace e as ações do dia a dia (conectar, testar). */
export function ConexaoMarketplace({ canal, status, descricao, ehAdmin }: { canal: IdMarketplace; status: StatusMarketplace; descricao: string; ehAdmin: boolean }) {
  const { nome, slug } = MARKETPLACES[canal]
  // diasDesde é positivo para o passado: negativo aqui = dias que faltam.
  const diasParaVencer = status.autorizacao_expira_em ? -(diasDesde(status.autorizacao_expira_em) ?? 0) : null
  const venceLogo = diasParaVencer !== null && diasParaVencer <= DIAS_AVISO_AUTORIZACAO

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
      <CardHeader titulo="Conexão" descricao={descricao} />
      <CardContent className="space-y-4 text-sm">
        {status.conectado ? (
          <Dados colunas={4}>
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
          </Dados>
        ) : (
          <p className="text-suave">
            {status.configurado
              ? `Os dados do app já estão salvos. Falta autorizar o CRM na conta do ${nome}.`
              : `Ainda não conectado. Salve os dados do app em Credenciais e depois clique em Conectar ${nome}.`}
          </p>
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
          </div>
        )}
        {!ehAdmin && !status.conectado && <SomenteAdmin>Um administrador precisa colar os dados do app e conectar.</SomenteAdmin>}
      </CardContent>
    </Card>
  )
}

/** ID e chave do app, colados por um administrador. */
export function CredenciaisMarketplace({ canal, status }: { canal: IdMarketplace; status: StatusMarketplace }) {
  return <FormularioCredenciais canal={canal} status={status} {...CAMPOS[canal]} />
}

export function DesconectarMarketplace({ canal }: { canal: IdMarketplace }) {
  const { nome } = MARKETPLACES[canal]
  return (
    <ZonaDeRisco titulo={`Desconectar o ${nome}`} descricao="O CRM para de ler as vendas desse canal até conectar de novo.">
      <ActionButton
        acao={desconectarMarketplace.bind(null, canal)}
        variante="perigo"
        confirmar={`Desconectar o ${nome}? O CRM para de ler as vendas desse canal até conectar de novo.`}
      >
        <Unplug /> Desconectar
      </ActionButton>
    </ZonaDeRisco>
  )
}
