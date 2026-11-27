import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Beer, ClipboardCheck, RefreshCw, SearchX } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { cadastrarCervejaComLotes } from '@/features/lotes/actions'
import { FormularioNovosLotes } from '@/features/lotes/components/lotes-da-cerveja'
import { previaDaCervejaDaOlist } from '@/features/lotes/queries'
import { formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Cerveja da Olist' }

const VOLTAR = { href: '/lotes', rotulo: 'Lotes e validades' }

/**
 * Prévia da cerveja buscada (bipada ou pelo SKU) que ainda não está no controle. SÓ CONSULTA:
 * mostra o que veio da Olist e o formulário do lote; a cerveja só entra no controle quando o lote
 * é salvo. Sair desta tela sem salvar não deixa nada gravado.
 * Dois caminhos a partir daqui: cadastrar o lote das unidades que JÁ estão na Olist (não muda nada
 * lá) ou fazer o balanço de estoque (mercadoria nova / contagem: o total vai para a Olist).
 */
export default async function PaginaPreviaDaCerveja({ searchParams }: PageProps<'/lotes/novo'>) {
  const busca = await searchParams
  const olistId = Number(param(busca.produto))
  const codigo = (param(busca.codigo) ?? '').slice(0, 60)
  if (!Number.isSafeInteger(olistId) || olistId <= 0) redirect('/lotes')

  const previa = await previaDaCervejaDaOlist(olistId)
  if (previa.tipo === 'no-controle') redirect(`/lotes/${previa.id}`)
  if (previa.tipo === 'erro') {
    return (
      <>
        <PageHeader titulo="Cerveja da Olist" voltar={VOLTAR} />
        <Card>
          <EmptyState
            icone={SearchX}
            titulo="Não deu para ler a cerveja na Olist"
            descricao={previa.mensagem}
            acao={
              <ButtonLink href={`/lotes/novo?${new URLSearchParams({ produto: String(olistId), codigo })}`}>
                <RefreshCw /> Tentar de novo
              </ButtonLink>
            }
          />
        </Card>
      </>
    )
  }

  const { produto } = previa
  const estoque = produto.estoque === null ? null : Math.max(Math.floor(produto.estoque), 0)
  const balanco = `/lotes/novo/balanco?${new URLSearchParams({ produto: String(olistId), codigo })}`

  return (
    <>
      <PageHeader titulo={produto.nome} contexto={`SKU ${produto.sku ?? '—'} · ainda não está no controle`} voltar={VOLTAR} />

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
        <Card className="flex items-start gap-4 overflow-hidden p-4 lg:block lg:p-0">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-volt-50 text-volt-700 lg:aspect-square lg:size-auto lg:w-full lg:rounded-none">
            {produto.foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto do cadastro da Olist (só é copiada para o CRM ao salvar)
              <img src={produto.foto} alt={produto.nome} className="size-full object-cover" />
            ) : (
              <Beer className="size-1/3" aria-hidden />
            )}
          </div>
          <dl className="min-w-0 flex-1 space-y-3 lg:p-5">
            <div>
              <dt className="tipo-rotulo text-suave">Estoque na Olist</dt>
              <dd className="tipo-numero mt-1 text-[28px] leading-8">
                {estoque === null ? '—' : formatarNumero(estoque)}
                {estoque !== null && <span className="ml-1 text-[14px] font-medium text-suave">un.</span>}
              </dd>
              <dd className="mt-1 text-[12px] text-suave">{estoque === null ? 'A Olist não informou o estoque deste produto.' : 'Lido agora na Olist.'}</dd>
            </div>
            <div>
              <dt className="tipo-rotulo text-suave">SKU</dt>
              <dd className="tipo-dado mt-1 break-all text-[14px]">{produto.sku ?? '—'}</dd>
            </div>
            <p className="border-t border-linha pt-3 text-[12px] leading-[18px] text-suave">
              Só uma consulta: nada foi gravado. A cerveja entra no controle quando você salvar o lote; nada é enviado à Olist.
            </p>
          </dl>
        </Card>

        {estoque === 0 ? (
          <Card>
            <CardHeader
              titulo="Sem estoque na Olist"
              descricao="A Olist está com 0 un. desta cerveja, então não há unidades para separar em lotes. Se a mercadoria chegou, lance o estoque pelo balanço: você informa lote, quantidade e validade, e o total vai para a Olist."
            />
            <div className="px-4 pb-4 lg:px-5 lg:pb-5">
              <ButtonLink href={balanco} variante="primario" tamanho="md">
                <ClipboardCheck /> Lançar estoque (balanço)
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader
              titulo="Lotes e validades"
              descricao="Preencha o lote e a validade das unidades que já estão na Olist e salve: só então a cerveja entra no controle. Dá para lançar vários lotes de uma vez."
              acoes={
                <ButtonLink href={balanco} tamanho="sm">
                  <ClipboardCheck /> Balanço de estoque
                </ButtonLink>
              }
            />
            <FormularioNovosLotes acao={cadastrarCervejaComLotes.bind(null, olistId, codigo)} temLotes={false} estoqueOlist={estoque} semLote={estoque} foco />
            <p className="border-t border-linha px-4 py-3 text-[13px] text-suave lg:px-5">
              Chegou mercadoria ou o número da Olist não bate com a prateleira? Use o <strong>Balanço de estoque</strong>: ele manda o total contado para a
              Olist.
            </p>
          </Card>
        )}
      </div>
    </>
  )
}
