import { RefreshCw, Unplug } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatarDataHora, formatarNumero } from '@/lib/format'

import { desconectarMeta, verificarConexaoMeta } from '../actions'
import { QUALIDADE, rotuloLimite, type ConexaoMeta } from '../meta'
import { FormularioConexao } from './formulario-conexao'

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="tipo-rotulo text-suave">{rotulo}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  )
}

/** Conexão com a Meta: número, qualidade, limite e o formulário das credenciais. */
export function CartaoConexao({ conexao, ehAdmin, descadastros }: { conexao: ConexaoMeta; ehAdmin: boolean; descadastros: number }) {
  const qualidade = conexao.qualidade ? QUALIDADE[conexao.qualidade] : null
  const selo = !conexao.configurado ? (
    <Badge tom="alerta" ponto>Não conectado</Badge>
  ) : conexao.ultimo_erro ? (
    <Badge tom="perigo" ponto>Com erro</Badge>
  ) : (
    <Badge tom="sucesso" ponto>Conectado</Badge>
  )

  return (
    <Card>
      <CardHeader
        titulo="WhatsApp oficial (API da Meta)"
        descricao="Número exclusivo das Campanhas: as mensagens saem pelos servidores da Meta, sem risco de banimento por disparo."
        acoes={selo}
      />
      <CardContent className="space-y-4">
        {conexao.configurado && (
          <>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-papel p-4 text-[14px] sm:grid-cols-4">
              <Dado rotulo="Número">
                <span className="tipo-dado">{conexao.numero ?? '—'}</span>
              </Dado>
              <Dado rotulo="Nome na Meta">{conexao.nome_verificado ?? '—'}</Dado>
              <Dado rotulo="Qualidade">{qualidade ? <Badge tom={qualidade.tom} ponto>{qualidade.rotulo}</Badge> : '—'}</Dado>
              <Dado rotulo="Limite">{rotuloLimite(conexao.limite_tier)}</Dado>
            </dl>
            {conexao.ultimo_erro && (
              <Alert tom="erro" titulo="A Meta recusou a conexão">
                {conexao.ultimo_erro}
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton acao={verificarConexaoMeta}>
                <RefreshCw /> Atualizar status
              </ActionButton>
              {ehAdmin && (
                <ActionButton
                  acao={desconectarMeta}
                  variante="perigo"
                  confirmar="Desconectar o WhatsApp oficial? O token e a chave secreta serão apagados e nenhuma campanha será enviada até conectar de novo."
                >
                  <Unplug /> Desconectar
                </ActionButton>
              )}
              <span className="text-[12px] text-suave">
                {conexao.verificado_em ? `Conferido na Meta em ${formatarDataHora(conexao.verificado_em)}` : 'Ainda não conferido na Meta'}
                {descadastros > 0 && ` · ${formatarNumero(descadastros)} pessoa(s) pediram para não receber`}
              </span>
            </div>
          </>
        )}

        {ehAdmin ? (
          conexao.configurado ? (
            <details className="group rounded-xl border border-linha">
              <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-semibold hover:bg-papel/60 [&::-webkit-details-marker]:hidden">
                Trocar token ou IDs
              </summary>
              <div className="border-t border-linha p-4">
                <FormularioConexao conexao={conexao} />
              </div>
            </details>
          ) : (
            <FormularioConexao conexao={conexao} />
          )
        ) : (
          !conexao.configurado && <p className="text-[13px] text-suave">Um administrador precisa colar o token e os IDs da Meta aqui.</p>
        )}
      </CardContent>
    </Card>
  )
}
