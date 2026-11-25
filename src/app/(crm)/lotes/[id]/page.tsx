import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Beer, RefreshCw, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { atualizarCervejaDaOlist, removerCervejaDosLotes } from '@/features/lotes/actions'
import { FormularioNovosLotes, LinhaLote } from '@/features/lotes/components/lotes-da-cerveja'
import { contarLotes, obterCervejaDosLotes } from '@/features/lotes/queries'
import { situacaoValidade } from '@/features/lotes/validade'
import { formatarDataHora, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Lotes da cerveja' }

export default async function PaginaLotesDaCerveja({ params }: PageProps<'/lotes/[id]'>) {
  const { id } = await params
  const cerveja = await obterCervejaDosLotes(id)
  if (!cerveja) notFound()

  const { lotes } = cerveja
  const nosLotes = contarLotes(lotes)
  const variosLotes = lotes.length > 1
  const semQuantidade = variosLotes ? lotes.filter((l) => l.quantidade === null).length : 0
  // Com todos os lotes informados, a soma deles deve bater com o estoque da Olist.
  const diferenca = variosLotes && semQuantidade === 0 && cerveja.estoque_olist !== null ? nosLotes.unidades - cerveja.estoque_olist : 0
  const dias = lotes.map((l) => situacaoValidade(l.validade).dias)
  const vencidos = dias.filter((d) => d < 0).length
  const vencemLogo = dias.filter((d) => d >= 0 && d <= 30).length
  const resumoLotes = [
    `${lotes.length} lote${lotes.length === 1 ? '' : 's'}`,
    `${formatarNumero(nosLotes.unidades)} un.`,
    vencidos ? `${vencidos} vencido${vencidos === 1 ? '' : 's'}` : null,
    vencemLogo ? `${vencemLogo} vence${vencemLogo === 1 ? '' : 'm'} em até 30 dias` : null,
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
                {cerveja.estoque_lido_em ? `Lido em ${formatarDataHora(cerveja.estoque_lido_em)}` : 'Ainda não lido'}
              </dd>
            </div>
            {variosLotes && (
              <div>
                <dt className="tipo-rotulo text-suave">Soma dos lotes</dt>
                <dd className="tipo-dado mt-1 text-[14px]">{formatarNumero(nosLotes.unidades)} un.</dd>
                {semQuantidade > 0 ? (
                  <dd className="mt-1 text-[12px] font-medium text-alerta">
                    {semQuantidade} lote{semQuantidade === 1 ? '' : 's'} sem quantidade: informe para a soma fechar.
                  </dd>
                ) : diferenca !== 0 ? (
                  <dd className="mt-1 text-[12px] text-suave">
                    {formatarNumero(Math.abs(diferenca))} un. a {diferenca > 0 ? 'mais' : 'menos'} que o estoque da Olist.
                  </dd>
                ) : null}
              </div>
            )}
            <div>
              <dt className="tipo-rotulo text-suave">SKU</dt>
              <dd className="tipo-dado mt-1 break-all text-[14px]">{cerveja.sku}</dd>
            </div>
            <p className="border-t border-linha pt-3 text-[12px] leading-[18px] text-suave">
              Foto, nome e estoque vêm da Olist só para consulta. Lote e validade ficam apenas aqui no CRM.
            </p>
          </dl>
        </Card>

        <Card>
          <CardHeader titulo="Lotes e validades" descricao={lotes.length ? resumoLotes : 'Cadastre o lote e a validade desta cerveja. Dá para lançar vários lotes de uma vez.'} />
          <FormularioNovosLotes cervejaId={id} lotesExistentes={lotes.length} estoqueOlist={cerveja.estoque_olist} foco={lotes.length === 0} />
          {lotes.length > 0 ? (
            <ul className="divide-y divide-linha border-t border-linha">
              {lotes.map((lote) => (
                <LinhaLote key={lote.id} lote={lote} variosLotes={variosLotes} />
              ))}
            </ul>
          ) : (
            <p className="border-t border-linha px-4 py-8 text-center text-sm text-suave lg:px-5">Nenhum lote cadastrado ainda.</p>
          )}
        </Card>
      </div>
    </>
  )
}
