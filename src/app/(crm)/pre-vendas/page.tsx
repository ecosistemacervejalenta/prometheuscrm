import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Rocket } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { CanalBadge, StatusPreVendaBadge } from '@/features/pedidos/components/selos'
import { listarPreVendas } from '@/features/pre-vendas/queries'
import { formatarDataHora, formatarMoeda, formatarNumero } from '@/lib/format'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'Pré-vendas' }

export default async function PaginaPreVendas() {
  const [preVendas, site] = await Promise.all([listarPreVendas(), urlDoSite()])
  const ativas = preVendas.filter((p) => p.status_efetivo === 'ativa').length

  return (
    <>
      <PageHeader
        titulo="Pré-vendas"
        contexto={`${ativas} ativa(s) · ${preVendas.length} no total`}
        descricao="Crie a campanha, dispare o link no WhatsApp e acompanhe os pedidos chegando."
        acoes={
          <ButtonLink href="/pre-vendas/nova" variante="primario">
            <Plus /> Nova pré-venda
          </ButtonLink>
        }
      />

      {preVendas.length === 0 ? (
        <Card>
          <EmptyState
            icone={Rocket}
            titulo="Nenhuma pré-venda ainda"
            descricao="Monte uma campanha com as cervejas, gere o link e envie no grupo VIP. O cliente escolhe, informa o endereço uma única vez e o pedido cai aqui."
            acao={<ButtonLink href="/pre-vendas/nova" variante="primario"><Plus /> Criar a primeira</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {preVendas.map((pv) => (
            <Card key={pv.id} className="flex flex-col p-4 lg:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <StatusPreVendaBadge status={pv.status_efetivo} />
                <CanalBadge canal={pv.canal} />
              </div>
              <Link href={`/pre-vendas/${pv.id}`} className="tipo-h3 hover:text-volt-700">
                {pv.titulo}
              </Link>
              <p className="tipo-dado mt-1 text-[12px] text-suave">
                {pv.encerra_em ? `encerra ${formatarDataHora(pv.encerra_em)}` : 'sem data de encerramento'}
              </p>
              <dl className="my-4 grid grid-cols-3 gap-2 rounded-xl bg-papel p-3 text-center lg:my-5">
                <div>
                  <dt className="tipo-rotulo text-suave">Pedidos</dt>
                  <dd className="tipo-numero text-lg">{formatarNumero(pv.pedidos)}</dd>
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Unid.</dt>
                  <dd className="tipo-numero text-lg">{formatarNumero(pv.unidades)}</dd>
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Total</dt>
                  <dd className="tipo-numero truncate text-lg">{formatarMoeda(pv.total_vendido).replace(',00', '')}</dd>
                </div>
              </dl>
              <div className="mt-auto flex gap-2">
                <ButtonLink href={`/pre-vendas/${pv.id}`} tamanho="sm" variante="escuro" className="flex-1">
                  Abrir
                </ButtonLink>
                <CopyButton texto={`${site}/p/${pv.slug}`} rotulo="Copiar link" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
