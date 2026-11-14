import { RefreshCw, Unplug } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dado, Dados, ZonaDeRisco } from '@/features/configuracoes/components/blocos'
import { formatarData, formatarDataHora, formatarNumero } from '@/lib/format'

import { desconectarMeta, verificarConexaoMeta } from '../actions'
import { formatarCusto, precoDaConexao } from '../custo'
import { QUALIDADE, rotuloLimite, type ConexaoMeta } from '../meta'

/** Situação do WhatsApp oficial em uma etiqueta (cabeçalho da seção e visão geral). */
export function situacaoMeta(conexao: ConexaoMeta): { tom: 'sucesso' | 'alerta' | 'perigo'; rotulo: string } {
  if (!conexao.configurado) return { tom: 'alerta', rotulo: 'Não conectado' }
  return conexao.ultimo_erro ? { tom: 'perigo', rotulo: 'Com erro' } : { tom: 'sucesso', rotulo: 'Conectado' }
}

export function SeloMeta({ conexao }: { conexao: ConexaoMeta }) {
  const { tom, rotulo } = situacaoMeta(conexao)
  return <Badge tom={tom} ponto>{rotulo}</Badge>
}

/** Número conectado na Meta: qualidade, limite e preço. Só aparece depois de conectado. */
export function NumeroMeta({ conexao, descadastros }: { conexao: ConexaoMeta; descadastros: number }) {
  if (!conexao.configurado) return null
  const qualidade = conexao.qualidade ? QUALIDADE[conexao.qualidade] : null
  const preco = precoDaConexao(conexao)

  return (
    <Card>
      <CardHeader
        titulo="Número conectado"
        descricao="Número exclusivo das Campanhas: as mensagens saem pelos servidores da Meta, sem risco de banimento por disparo."
        acoes={
          <ActionButton acao={verificarConexaoMeta}>
            <RefreshCw /> Atualizar status
          </ActionButton>
        }
      />
      <CardContent className="space-y-4">
        <Dados colunas={3}>
          <Dado rotulo="Número">
            <span className="tipo-dado">{conexao.numero ?? '—'}</span>
          </Dado>
          <Dado rotulo="Nome na Meta">{conexao.nome_verificado ?? '—'}</Dado>
          <Dado rotulo="Qualidade">{qualidade ? <Badge tom={qualidade.tom} ponto>{qualidade.rotulo}</Badge> : '—'}</Dado>
          <Dado rotulo="Limite">{rotuloLimite(conexao.limite_tier)}</Dado>
          <Dado rotulo="Preço por mensagem">
            <span className="tipo-dado">{formatarCusto(preco.valor, preco.moeda, true)}</span>
            <span className="block text-[12px] text-suave">
              {preco.medidoEm ? `cobrado na conta em ${formatarData(preco.medidoEm)}` : 'tabela da Meta (Brasil)'}
            </span>
          </Dado>
          <Dado rotulo="Pediram para não receber">
            <span className="tipo-dado">{formatarNumero(descadastros)}</span>
          </Dado>
        </Dados>
        {conexao.ultimo_erro && (
          <Alert tom="erro" titulo="A Meta recusou a conexão">
            {conexao.ultimo_erro}
          </Alert>
        )}
        <p className="text-[12px] text-suave">
          {conexao.verificado_em ? `Conferido na Meta em ${formatarDataHora(conexao.verificado_em)}` : 'Ainda não conferido na Meta'}
        </p>
      </CardContent>
    </Card>
  )
}

export function DesconectarMeta() {
  return (
    <ZonaDeRisco
      titulo="Desconectar o WhatsApp oficial"
      descricao="O token e a chave secreta são apagados e nenhuma campanha é enviada até conectar de novo."
    >
      <ActionButton
        acao={desconectarMeta}
        variante="perigo"
        confirmar="Desconectar o WhatsApp oficial? O token e a chave secreta serão apagados e nenhuma campanha será enviada até conectar de novo."
      >
        <Unplug /> Desconectar
      </ActionButton>
    </ZonaDeRisco>
  )
}
