import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Ban, MessageCircle, Pause, Play, RotateCcw, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonExternal } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import {
  cancelarCampanha,
  excluirCampanha,
  pausarCampanha,
  reenviarParaAnalise,
  retomarCampanha,
} from '@/features/campanhas/actions'
import { AtualizacaoAutomatica } from '@/features/campanhas/components/atualizacao-automatica'
import { PreviaWhatsapp } from '@/features/campanhas/components/previa-whatsapp'
import { TesteCampanha } from '@/features/campanhas/components/teste-campanha'
import { urlImagemCampanha } from '@/features/campanhas/mensagem'
import { rotuloLimite } from '@/features/campanhas/meta'
import { conexaoMeta, falhasDaCampanha, obterCampanha, respostasDaCampanha } from '@/features/campanhas/queries'
import {
  percentual,
  situacaoDaCampanha,
  STATUS_ATIVOS,
  STATUS_EM_ANDAMENTO,
  STATUS_EXCLUIVEIS,
  STATUS_MODELO,
} from '@/features/campanhas/status'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { formatarDataHora, formatarNumero, formatarRelativo, formatarWhatsapp } from '@/lib/format'
import { linkWhatsapp } from '@/lib/whatsapp'

export async function generateMetadata({ params }: PageProps<'/campanhas/[id]'>): Promise<Metadata> {
  const campanha = await obterCampanha((await params).id)
  return { title: campanha?.nome ?? 'Campanha' }
}

function Aviso({ campanha, limite }: { campanha: NonNullable<Awaited<ReturnType<typeof obterCampanha>>>; limite: string }) {
  const erro = campanha.ultimo_erro
  switch (campanha.status) {
    case 'preparando':
      return (
        <Alert tom="alerta" titulo="Campanha incompleta">
          Os contatos não terminaram de subir. Exclua e monte a campanha de novo.
        </Alert>
      )
    case 'aguardando_aprovacao':
      return (
        <Alert tom="info" titulo="Em análise pela Meta">
          Costuma levar de alguns minutos a poucas horas.{' '}
          {campanha.agendada_para
            ? `Depois de aprovada, sai em ${formatarDataHora(campanha.agendada_para)}.`
            : 'O envio começa sozinho assim que ela aprovar.'}
        </Alert>
      )
    case 'agendada':
      return (
        <Alert tom="info" titulo="Mensagem aprovada">
          Envio agendado para {formatarDataHora(campanha.agendada_para)}. Aproveite para mandar um teste para o seu WhatsApp.
        </Alert>
      )
    case 'enviando':
      return campanha.pausada_motivo === 'limite' ? (
        <Alert tom="alerta" titulo="Limite diário atingido">
          O número pode falar com {limite.toLowerCase()} diferentes a cada 24 h. O envio continua sozinho assim que o limite liberar.
        </Alert>
      ) : (
        <Alert tom="sucesso" titulo="Enviando">
          As mensagens estão saindo aos poucos. Esta tela se atualiza sozinha.
        </Alert>
      )
    case 'pausada':
      return (
        <Alert tom="alerta" titulo={campanha.pausada_motivo === 'equipe' ? 'Pausada pela equipe' : 'Pausada automaticamente'}>
          {campanha.pausada_motivo === 'equipe' ? 'Nada é enviado até alguém retomar.' : erro}
        </Alert>
      )
    case 'concluida':
      return (
        <Alert tom="sucesso" titulo="Campanha concluída">
          Todos os envios terminaram em {formatarDataHora(campanha.concluida_em)}. Entregas, leituras e respostas continuam chegando.
        </Alert>
      )
    case 'recusada':
      return (
        <Alert tom="erro" titulo="A Meta recusou a mensagem">
          {erro} Ajuste o texto (evite promessas exageradas, links encurtados e excesso de emojis) e monte uma campanha nova.
        </Alert>
      )
    case 'falhou':
      return (
        <Alert tom="erro" titulo="A mensagem não chegou à Meta">
          {erro}
        </Alert>
      )
    case 'cancelada':
      return <Alert tom="info">Campanha cancelada. Quem ainda não tinha recebido ficou sem a mensagem.</Alert>
    default:
      return null
  }
}

export default async function PaginaCampanha({ params }: PageProps<'/campanhas/[id]'>) {
  const { id } = await params
  const campanha = await obterCampanha(id)
  if (!campanha) notFound()

  const [respostas, falhas, conexao, config] = await Promise.all([
    respostasDaCampanha(id),
    falhasDaCampanha(id),
    conexaoMeta(),
    obterConfiguracoes(),
  ])
  const status = campanha.status ?? 'preparando'
  const situacao = situacaoDaCampanha(campanha)
  const modelo = campanha.modelo_status ? STATUS_MODELO[campanha.modelo_status] : null
  const contatos = (campanha.total ?? 0) - (campanha.ignoradas ?? 0)
  const enviadas = campanha.enviadas ?? 0
  const processados = contatos - (campanha.pendentes ?? 0)
  const andamento = contatos ? Math.round((processados / contatos) * 100) : 0

  return (
    <>
      {STATUS_EM_ANDAMENTO.includes(status) && <AtualizacaoAutomatica />}
      <PageHeader
        voltar={{ href: '/campanhas', rotulo: 'Campanhas' }}
        contexto={`Criada em ${formatarDataHora(campanha.criado_em)}${campanha.autor ? ` por ${campanha.autor}` : ''}`}
        titulo={campanha.nome}
        acoes={
          <>
            {STATUS_ATIVOS.includes(status) && (
              <ActionButton acao={pausarCampanha.bind(null, id)} tamanho="md">
                <Pause /> Pausar
              </ActionButton>
            )}
            {status === 'pausada' && (
              <ActionButton acao={retomarCampanha.bind(null, id)} variante="primario" tamanho="md">
                <Play /> Retomar
              </ActionButton>
            )}
            {status === 'falhou' && (
              <ActionButton acao={reenviarParaAnalise.bind(null, id)} variante="primario" tamanho="md">
                <RotateCcw /> Enviar para a Meta de novo
              </ActionButton>
            )}
            {(STATUS_ATIVOS.includes(status) || status === 'pausada') && (
              <ActionButton
                acao={cancelarCampanha.bind(null, id)}
                variante="perigo"
                tamanho="md"
                confirmar="Cancelar a campanha? Quem ainda não recebeu fica sem a mensagem."
              >
                <Ban /> Cancelar
              </ActionButton>
            )}
            {STATUS_EXCLUIVEIS.includes(status) && (
              <ActionButton acao={excluirCampanha.bind(null, id)} variante="perigo" tamanho="md" confirmar="Excluir esta campanha?">
                <Trash2 /> Excluir
              </ActionButton>
            )}
          </>
        }
      />

      <div className="space-y-5 lg:space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tom={situacao.tom} ponto>{situacao.rotulo}</Badge>
          {campanha.origem_descricao && <span className="text-[13px] text-suave">Público: {campanha.origem_descricao}</span>}
        </div>
        <Aviso campanha={campanha} limite={rotuloLimite(conexao.limite_tier)} />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
          <Kpi
            rotulo="Contatos"
            valor={formatarNumero(contatos)}
            detalhe={campanha.ignoradas ? `${formatarNumero(campanha.ignoradas)} fora da lista` : 'sem repetidos'}
          />
          <Kpi rotulo="Enviadas" valor={formatarNumero(enviadas)} detalhe={`${formatarNumero(campanha.pendentes)} na fila`} />
          <Kpi rotulo="Entregues" valor={percentual(campanha.entregues, enviadas)} detalhe={`${formatarNumero(campanha.entregues)} das enviadas`} tendencia="positiva" />
          <Kpi rotulo="Lidas" valor={percentual(campanha.lidas, enviadas)} detalhe={`${formatarNumero(campanha.lidas)} das enviadas`} />
          <Kpi rotulo="Respostas" valor={formatarNumero(campanha.respostas)} detalhe={`${formatarNumero(campanha.sairam)} pediram para sair`} />
          <Kpi
            rotulo="Falhas"
            valor={formatarNumero(campanha.falhas)}
            detalhe={campanha.falhas ? 'motivos abaixo' : 'nenhuma'}
            tendencia={campanha.falhas ? 'negativa' : 'neutra'}
          />
        </div>

        {['enviando', 'pausada', 'concluida', 'cancelada'].includes(status) && contatos > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-semibold">Andamento</span>
              <span className="tipo-dado text-suave">
                {formatarNumero(processados)} de {formatarNumero(contatos)} · {andamento}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-superficie ring-1 ring-linha ring-inset">
              <div className="h-full rounded-full bg-volt transition-[width]" style={{ width: `${andamento}%` }} />
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <div className="min-w-0 space-y-5 lg:space-y-6">
            <Card>
              <CardHeader
                titulo="Respostas"
                descricao="Os clientes respondem no número das campanhas. Continue a conversa pelo WhatsApp da loja."
              />
              {respostas.length === 0 ? (
                <p className="px-4 pb-5 text-sm text-suave lg:px-5">Ninguém respondeu ainda.</p>
              ) : (
                <ul className="divide-y divide-linha border-t border-linha">
                  {respostas.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 lg:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold">
                          {r.nome ?? formatarWhatsapp(r.whatsapp)}{' '}
                          {r.saiu_em && <Badge tom="neutro">Pediu para sair</Badge>}
                        </p>
                        <p className="text-[12px] text-suave">
                          {r.nome ? `${formatarWhatsapp(r.whatsapp)} · ` : ''}
                          {formatarRelativo(r.respondida_em)}
                        </p>
                        {r.resposta && <p className="mt-1 text-[14px] break-words whitespace-pre-wrap">{r.resposta}</p>}
                      </div>
                      {!r.saiu_em && (
                        <ButtonExternal href={linkWhatsapp(r.whatsapp)} variante="whatsapp" tamanho="sm">
                          <MessageCircle /> Conversar
                        </ButtonExternal>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {falhas.length > 0 && (
              <Card>
                <CardHeader titulo="Não enviadas" descricao="Números que ficaram sem a mensagem, pelo motivo informado pela Meta." />
                <ul className="divide-y divide-linha border-t border-linha">
                  {falhas.map((f) => (
                    <li key={f.motivo} className="flex items-start justify-between gap-3 px-4 py-3 text-[14px] lg:px-5">
                      <span className="min-w-0">{f.motivo}</span>
                      <span className="tipo-dado shrink-0 text-suave">{formatarNumero(f.quantidade)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="space-y-5 lg:space-y-6">
            <Card>
              <CardHeader titulo="Mensagem" acoes={modelo && <Badge tom={modelo.tom} ponto>{modelo.rotulo}</Badge>} />
              <CardContent className="space-y-4">
                <PreviaWhatsapp
                  mensagem={{
                    texto: campanha.texto ?? '',
                    nomePadrao: campanha.nome_padrao ?? 'cliente',
                    rodape: campanha.rodape ?? '',
                    botaoLink: campanha.botao_texto ? { texto: campanha.botao_texto, url: campanha.botao_url ?? '' } : null,
                    botaoSair: campanha.botao_sair ?? false,
                  }}
                  imagem={urlImagemCampanha(campanha.imagem_path)}
                  nomeLoja={conexao.nome_verificado ?? config.nome_loja}
                  nomeContato="Mariana Costa"
                />
                {campanha.modelo_nome && (
                  <p className="text-[12px] text-suave">
                    Modelo na Meta: <span className="tipo-dado text-[12px]">{campanha.modelo_nome}</span>
                  </p>
                )}
              </CardContent>
            </Card>

            {campanha.modelo_status === 'APPROVED' && (
              <Card>
                <CardHeader titulo="Enviar um teste" />
                <CardContent>
                  <TesteCampanha campanhaId={id} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
