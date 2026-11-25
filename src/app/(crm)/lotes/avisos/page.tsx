import type { Metadata } from 'next'
import Link from 'next/link'
import { Send } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { alternarAvisosNoGrupo, testarAvisoNoGrupo } from '@/features/lotes/actions-avisos'
import { HORARIO_AVISOS } from '@/features/lotes/avisos'
import { ListaAvisos } from '@/features/lotes/components/avisos-grupo'
import { configuracaoDosAvisos, listarAvisos } from '@/features/lotes/queries'
import { exigirEquipe } from '@/lib/auth'

export const metadata: Metadata = { title: 'Avisos no grupo' }

export default async function PaginaAvisosNoGrupo() {
  const { perfil } = await exigirEquipe()
  const [avisos, config] = await Promise.all([listarAvisos(), configuracaoDosAvisos()])
  const admin = perfil.papel === 'admin'
  const semTratativa = avisos.filter((a) => !a.teste && a.tratativas.length === 0).length

  return (
    <>
      <PageHeader
        titulo="Avisos no grupo"
        contexto={semTratativa ? `${semTratativa} aviso(s) aguardando tratativa` : 'Lotes e validades'}
        voltar={{ href: '/lotes', rotulo: 'Lotes e validades' }}
        descricao="Quando um lote entra em Alerta (até 30 dias), Atenção (até 15) ou Crítico (até 7), o grupo da equipe no WhatsApp recebe o aviso com o botão para registrar a tratativa."
        acoes={
          <ActionButton acao={testarAvisoNoGrupo} variante="primario" tamanho="md">
            <Send /> Enviar mensagem de teste
          </ActionButton>
        }
      />

      <Card className="mb-4 lg:mb-6">
        <CardHeader titulo="Como funciona" />
        <dl className="grid gap-x-6 gap-y-4 border-t border-linha px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-5">
          <div>
            <dt className="tipo-rotulo text-suave">Avisos automáticos</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tom={config.ativo ? 'sucesso' : 'neutro'} ponto>
                {config.ativo ? 'Ligados' : 'Pausados'}
              </Badge>
              {admin && (
                <ActionButton
                  acao={alternarAvisosNoGrupo.bind(null, !config.ativo)}
                  confirmar={config.ativo ? 'Pausar os avisos automáticos no grupo?' : undefined}
                >
                  {config.ativo ? 'Pausar' : 'Ligar'}
                </ActionButton>
              )}
            </dd>
          </div>
          <div>
            <dt className="tipo-rotulo text-suave">Quem manda no grupo</dt>
            <dd className="mt-1 text-sm">
              {config.webhook === 'ok' ? (
                <Badge tom="sucesso" ponto>
                  n8n conectado
                </Badge>
              ) : (
                <Link href="/configuracoes/webhooks" className="font-semibold text-perigo hover:underline">
                  {config.webhook === 'pausado' ? 'Webhook do n8n pausado' : 'Falta o webhook do n8n'}
                </Link>
              )}
              <span className="mt-1 block text-[12px] text-suave">Fluxo “Validade dos lotes” no n8n, pelo WhatsApp da loja.</span>
            </dd>
          </div>
          <div>
            <dt className="tipo-rotulo text-suave">Horário</dt>
            <dd className="mt-1 text-sm">
              Das {HORARIO_AVISOS.inicio}h às {HORARIO_AVISOS.fim}h
              <span className="mt-1 block text-[12px] text-suave">O que mudar de faixa de madrugada é avisado às {HORARIO_AVISOS.inicio}h.</span>
            </dd>
          </div>
          <div>
            <dt className="tipo-rotulo text-suave">Quando avisa</dt>
            <dd className="mt-1 text-sm">
              Uma vez em cada faixa, por lote
              <span className="mt-1 block text-[12px] text-suave">Lote esgotado não avisa. A tratativa vai para o histórico do produto.</span>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader titulo="Avisos enviados" descricao="Os mais recentes primeiro. O teste também aparece aqui, marcado como Teste." />
        <ListaAvisos avisos={avisos} />
      </Card>
    </>
  )
}
