import { Beer } from 'lucide-react'

import type { AcaoFormulario } from '@/components/form/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { formatarNumero } from '@/lib/format'

import type { CaixaVipDoProduto } from '../queries'
import { FormularioBalanco, type LoteNoBalanco } from './formulario-balanco'

/**
 * Tela do balanço de estoque: a cerveja e o estoque dela na Olist de um lado, a contagem por
 * lote do outro. Serve para a cerveja do controle e para a que ainda não entrou (mercadoria nova).
 */
export function TelaDoBalanco({
  nome,
  sku,
  foto,
  estoqueOlist,
  lidoAgora,
  nosLotes,
  lotes,
  caixaVip,
  acao,
  voltar,
  noControle,
}: {
  nome: string
  sku: string | null
  foto: string | null
  /** Estoque na Olist (null = a Olist não informou). */
  estoqueOlist: number | null
  /** false = a Olist não respondeu agora; o número é o da última leitura guardada. */
  lidoAgora: boolean
  /** Soma dos lotes no CRM (null = cerveja ainda fora do controle). */
  nosLotes: number | null
  lotes: LoteNoBalanco[]
  caixaVip: CaixaVipDoProduto
  acao: AcaoFormulario
  voltar: { href: string; rotulo: string }
  noControle: boolean
}) {
  return (
    <>
      <PageHeader titulo="Balanço de estoque" contexto={`${nome} · SKU ${sku ?? '—'}`} voltar={voltar} />

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
        <Card className="flex items-start gap-4 overflow-hidden p-4 lg:block lg:p-0">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-volt-50 text-volt-700 lg:aspect-square lg:size-auto lg:w-full lg:rounded-none">
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto do Supabase Storage ou do cadastro da Olist
              <img src={foto} alt={nome} className="size-full object-cover" />
            ) : (
              <Beer className="size-1/3" aria-hidden />
            )}
          </div>
          <dl className="min-w-0 flex-1 space-y-3 lg:p-5">
            <div>
              <dt className="tipo-rotulo text-suave">Estoque na Olist</dt>
              <dd className="tipo-numero mt-1 text-[28px] leading-8">
                {estoqueOlist === null ? '—' : formatarNumero(estoqueOlist)}
                {estoqueOlist !== null && <span className="ml-1 text-[14px] font-medium text-suave">un.</span>}
              </dd>
              <dd className="mt-1 text-[12px] text-suave">
                {estoqueOlist === null
                  ? 'A Olist não informou o estoque deste produto.'
                  : lidoAgora
                    ? 'Lido agora na Olist.'
                    : 'A Olist não respondeu agora: este é o número da última leitura.'}
              </dd>
            </div>
            {nosLotes !== null && (
              <div>
                <dt className="tipo-rotulo text-suave">Nos lotes do CRM</dt>
                <dd className="tipo-dado mt-1 text-[14px]">{formatarNumero(nosLotes)} un.</dd>
              </div>
            )}
            <div>
              <dt className="tipo-rotulo text-suave">SKU</dt>
              <dd className="tipo-dado mt-1 break-all text-[14px]">{sku ?? '—'}</dd>
            </div>
            <p className="border-t border-linha pt-3 text-[12px] leading-[18px] text-suave">
              No balanço, o total contado vira o estoque desta cerveja na Olist. Só o número do estoque muda lá.
              {!noControle && ' A cerveja entra no controle de lotes junto com o balanço.'}
            </p>
          </dl>
        </Card>

        <Card>
          <CardHeader
            titulo="Contagem por lote"
            descricao={
              lotes.length > 0
                ? 'Informe quanto contou de cada lote (0 se acabou). Se chegou mercadoria, adicione o lote novo. A soma vai para a Olist.'
                : 'Informe o lote, a quantidade e a validade do que está na prateleira. A soma vai para a Olist.'
            }
          />
          <FormularioBalanco acao={acao} nome={nome} lotes={lotes} estoqueOlist={estoqueOlist} caixaVip={caixaVip} />
        </Card>
      </div>
    </>
  )
}
