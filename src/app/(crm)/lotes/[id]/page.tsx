import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Beer, RefreshCw, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { adicionarLotes, atualizarCervejaDaOlist, removerCervejaDosLotes } from '@/features/lotes/actions'
import { HistoricoLotes } from '@/features/lotes/components/historico-lotes'
import { FormularioNovosLotes, LinhaLote } from '@/features/lotes/components/lotes-da-cerveja'
import { FREQUENCIA_LEITURA, quandoLeu } from '@/features/lotes/leitura'
import { avisosDosLotes, HISTORICO_RESUMIDO, listarHistoricoDoProduto, obterCervejaDosLotes } from '@/features/lotes/queries'
import { situacaoValidade } from '@/features/lotes/validade'
import { formatarNumero } from '@/lib/format'
import { cn, param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Lotes da cerveja' }

export default async function PaginaLotesDaCerveja({ params, searchParams }: PageProps<'/lotes/[id]'>) {
  const { id } = await params
  const completo = param((await searchParams).historico) === 'completo'
  const cerveja = await obterCervejaDosLotes(id)
  if (!cerveja) notFound()
  const [historico, avisos] = await Promise.all([
    listarHistoricoDoProduto(cerveja.olist_id, completo),
    avisosDosLotes(cerveja.lotes.map((l) => l.id)),
  ])

  const { lotes, nosLotes, semLote } = cerveja
  // Lote esgotado (0 un.) não entra na conta de vencidos.
  const dias = lotes.filter((l) => l.quantidade !== 0).map((l) => situacaoValidade(l.validade).dias)
  const esgotados = lotes.filter((l) => l.quantidade === 0).length
  const vencidos = dias.filter((d) => d < 0).length
  const vencemLogo = dias.filter((d) => d >= 0 && d <= 30).length
  const resumoLotes = [
    `${lotes.length} lote${lotes.length === 1 ? '' : 's'}`,
    `${formatarNumero(nosLotes)} un.`,
    vencidos ? `${vencidos} vencido${vencidos === 1 ? '' : 's'}` : null,
    vencemLogo ? `${vencemLogo} vence${vencemLogo === 1 ? '' : 'm'} em até 30 dias` : null,
    esgotados ? `${esgotados} esgotado${esgotados === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <PageHeader
        titulo={cerveja.nome}
        contexto={`SKU ${cerveja.sku}`}
        voltar={{ href: '/lotes', rotulo: 'Lotes e validades' }}
        acoes={
          <>
            <ActionButton acao={atualizarCervejaDaOlist.bind(null, id)} tamanho="md">
              <RefreshCw /> Atualizar da Olist
            </ActionButton>
            <ActionButton
              acao={removerCervejaDosLotes.bind(null, id)}
              variante="perigo"
              tamanho="md"
              confirmar={
                lotes.length
                  ? `Remover ${cerveja.nome} do controle? Os ${lotes.length} lote(s) cadastrados serão apagados. Nada muda na Olist.`
                  : `Remover ${cerveja.nome} do controle? Nada muda na Olist.`
              }
            >
              <Trash2 /> Remover
            </ActionButton>
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
        <Card className="flex items-start gap-4 overflow-hidden p-4 lg:block lg:p-0">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-volt-50 text-volt-700 lg:aspect-square lg:size-auto lg:w-full lg:rounded-none">
            {cerveja.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Supabase Storage
              <img src={cerveja.foto_url} alt={cerveja.nome} className="size-full object-cover" />
            ) : (
              <Beer className="size-1/3" aria-hidden />
            )}
          </div>
          <dl className="min-w-0 flex-1 space-y-3 lg:p-5">
            <div>
              <dt className="tipo-rotulo text-suave">Estoque na Olist</dt>
              <dd className="tipo-numero mt-1 text-[28px] leading-8">
                {cerveja.estoque_olist === null ? '—' : formatarNumero(cerveja.estoque_olist)}
                {cerveja.estoque_olist !== null && <span className="ml-1 text-[14px] font-medium text-suave">un.</span>}
              </dd>
              <dd className="mt-1 text-[12px] text-suave">
                {cerveja.estoque_olist === null ? 'A Olist não informou o estoque deste produto. ' : ''}
                {cerveja.estoque_lido_em ? `Atualizado em ${quandoLeu(cerveja.estoque_lido_em)}` : 'Ainda não lido'}
                {cerveja.leitura_erro && (
                  <span className="mt-1 block font-medium text-perigo">
                    Última tentativa de leitura falhou
                    {cerveja.leitura_erro_em ? ` (${quandoLeu(cerveja.leitura_erro_em)})` : ''}: {cerveja.leitura_erro}
                  </span>
                )}
                <span className="block text-sutil">Atualiza sozinho {FREQUENCIA_LEITURA} e quando a Olist avisa.</span>
              </dd>
            </div>
            {lotes.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="tipo-rotulo text-suave">Nos lotes</dt>
                  <dd className="tipo-dado mt-1 text-[14px]">{formatarNumero(nosLotes)} un.</dd>
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Sem lote</dt>
                  <dd className={cn('tipo-dado mt-1 text-[14px]', semLote ? 'font-semibold text-alerta' : '')}>
                    {semLote === null ? '—' : `${formatarNumero(semLote)} un.`}
                  </dd>
                </div>
                {semLote ? (
                  <dd className="col-span-2 -mt-1 text-[12px] leading-[18px] font-medium text-alerta">
                    Entraram na Olist e ainda não têm lote: cadastre o lote delas.
                  </dd>
                ) : null}
              </div>
            )}
            <div>
              <dt className="tipo-rotulo text-suave">SKU</dt>
              <dd className="tipo-dado mt-1 break-all text-[14px]">{cerveja.sku}</dd>
            </div>
            <p className="border-t border-linha pt-3 text-[12px] leading-[18px] text-suave">
              Cada venda na Olist baixa sozinha do lote que vence primeiro. Nada é enviado à Olist: lote e validade ficam só aqui no CRM.
            </p>
          </dl>
        </Card>

        <div className="min-w-0 space-y-4 lg:space-y-6">
          <Card>
            <CardHeader
              titulo="Lotes e validades"
              descricao={lotes.length ? resumoLotes : 'Cadastre o lote e a validade desta cerveja. Dá para lançar vários lotes de uma vez.'}
            />
            <FormularioNovosLotes
              acao={adicionarLotes.bind(null, id)}
              temLotes={lotes.length > 0}
              estoqueOlist={cerveja.estoque_olist}
              semLote={semLote}
              foco={lotes.length === 0 || Boolean(semLote)}
            />
            {lotes.length > 0 ? (
              <ul className="divide-y divide-linha border-t border-linha">
                {lotes.map((lote) => (
                  <LinhaLote key={lote.id} lote={lote} aviso={avisos[lote.id]} />
                ))}
              </ul>
            ) : (
              <p className="border-t border-linha px-4 py-8 text-center text-sm text-suave lg:px-5">Nenhum lote cadastrado ainda.</p>
            )}
          </Card>
          <Card>
            <CardHeader
              titulo="Histórico do produto"
              descricao="Tudo o que aconteceu com este produto: cada mudança de estoque lida na Olist, as baixas automáticas nos lotes, o que a equipe mudou e as falhas de leitura."
              acoes={
                historico.total > HISTORICO_RESUMIDO &&
                (completo ? (
                  <ButtonLink href={`/lotes/${id}`} tamanho="sm" scroll={false}>
                    Ver só os últimos
                  </ButtonLink>
                ) : (
                  <ButtonLink href={`/lotes/${id}?historico=completo`} tamanho="sm" scroll={false}>
                    Ver histórico completo ({formatarNumero(historico.total)})
                  </ButtonLink>
                ))
              }
            />
            <HistoricoLotes movimentos={historico.movimentos} />
          </Card>
        </div>
      </div>
    </>
  )
}
