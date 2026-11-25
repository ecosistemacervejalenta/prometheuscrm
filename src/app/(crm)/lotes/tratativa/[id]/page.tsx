import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CircleCheck } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { EntregaComErro, FAIXA_DO_AVISO, SeloEntrega } from '@/features/lotes/components/avisos-grupo'
import { FormularioTratativa } from '@/features/lotes/components/formulario-tratativa'
import { SeloValidade } from '@/features/lotes/components/selo-validade'
import { obterAviso } from '@/features/lotes/queries'
import { formatarData, formatarDataHora, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Tratativa do lote' }

/** Aberta pelo botão "Registrar tratativa" da mensagem no grupo. */
export default async function PaginaTratativa({ params }: PageProps<'/lotes/tratativa/[id]'>) {
  const { id } = await params
  const aviso = await obterAviso(id)
  if (!aviso) notFound()

  const faixa = FAIXA_DO_AVISO[aviso.faixa]

  return (
    <>
      <PageHeader
        titulo={aviso.cerveja_nome}
        contexto={`Tratativa · lote ${aviso.lote}`}
        voltar={{ href: '/lotes/avisos', rotulo: 'Avisos no grupo' }}
        acoes={
          aviso.cerveja_id ? (
            <ButtonLink href={`/lotes/${aviso.cerveja_id}`} tamanho="md">
              Ver a cerveja
            </ButtonLink>
          ) : undefined
        }
      />

      {aviso.teste && (
        <Alert tom="info" titulo="Aviso de teste" className="mb-4 lg:mb-6">
          Este aviso foi criado pelo botão de teste. Pode registrar uma tratativa para testar: o grupo recebe a confirmação marcada como teste, e
          nada entra no histórico do produto.
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-6">
        <Card className="p-4 lg:p-5">
          <dl className="space-y-3">
            <div>
              <dt className="tipo-rotulo text-suave">Situação hoje</dt>
              <dd className="mt-1">
                <SeloValidade validade={aviso.validade} />
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="tipo-rotulo text-suave">Lote</dt>
                <dd className="tipo-dado mt-1 text-[14px]">{aviso.lote}</dd>
              </div>
              <div>
                <dt className="tipo-rotulo text-suave">Validade</dt>
                <dd className="tipo-dado mt-1 text-[14px]">{formatarData(aviso.validade)}</dd>
              </div>
              <div>
                <dt className="tipo-rotulo text-suave">No aviso</dt>
                <dd className="mt-1">
                  <Badge tom={faixa.tom} ponto>
                    {faixa.rotulo}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="tipo-rotulo text-suave">Unidades no aviso</dt>
                <dd className="tipo-dado mt-1 text-[14px]">{aviso.quantidade === null ? '—' : `${formatarNumero(aviso.quantidade)} un.`}</dd>
              </div>
            </div>
            <div className="border-t border-linha pt-3">
              <dt className="tipo-rotulo text-suave">Aviso no grupo</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-suave">
                {formatarDataHora(aviso.criado_em)} <SeloEntrega aviso={aviso} />
              </dd>
              <EntregaComErro aviso={aviso} />
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            titulo="Tratativa"
            descricao={aviso.tratativas.length ? 'Quem tratou, quando e o que fez.' : 'Ninguém registrou a tratativa ainda.'}
          />
          {aviso.tratativas.length > 0 && (
            <ol className="mb-4 divide-y divide-linha border-y border-linha">
              {aviso.tratativas.map((t) => (
                <li key={t.id} className="flex gap-3 px-4 py-3 lg:px-5">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-sucesso" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[14px] leading-5">
                      <strong>Tratado por {t.autor ?? 'equipe'}</strong> em {formatarDataHora(t.criado_em)}
                    </p>
                    <p className="mt-1 text-[14px] leading-5 whitespace-pre-line text-ink/80">{t.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <FormularioTratativa alertaId={aviso.id} primeira={aviso.tratativas.length === 0} />
        </Card>
      </div>
    </>
  )
}
