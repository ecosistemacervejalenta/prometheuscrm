import type { Metadata } from 'next'
import Link from 'next/link'
import { HandCoins } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { pagamentosDoPortal, resumoDoPortal } from '@/features/influenciadores/portal/queries'
import { exigirInfluenciador } from '@/features/influenciadores/portal/sessao'
import { hojeISO } from '@/lib/datas'
import { formatarData, formatarMoeda, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Repasses' }

export default async function PaginaRepassesDoPortal() {
  const { influenciador: eu } = await exigirInfluenciador()
  const hoje = hojeISO()
  const [pagamentos, resumo] = await Promise.all([pagamentosDoPortal(), resumoDoPortal(hoje, hoje)])
  const { saldos } = resumo

  return (
    <div className="space-y-5 lg:space-y-6">
      <header>
        <p className="tipo-dado text-[13px] text-suave">{formatarNumero(pagamentos.length)} repasse(s) recebido(s)</p>
        <h1 className="tipo-h2 sm:tipo-h1 mt-0.5">Repasses</h1>
      </header>

      {!eu.chave_pix && (
        <Alert tom="alerta" titulo="Falta a sua chave PIX">
          Sem ela a loja não consegue pagar as comissões.{' '}
          <Link href="/portal/conta" className="font-semibold underline underline-offset-2">
            Cadastrar agora
          </Link>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        <Kpi
          rotulo="Disponível para receber"
          valor={formatarMoeda(saldos.disponivel)}
          detalhe={saldos.vendas_disponiveis > 0 ? `${saldos.vendas_disponiveis} venda(s) no próximo repasse` : 'nada liberado no momento'}
          destaque
          className="max-lg:col-span-2"
        />
        <Kpi
          rotulo="A liberar"
          valor={formatarMoeda(saldos.a_liberar)}
          detalhe={saldos.proxima_liberacao ? `próxima em ${formatarData(saldos.proxima_liberacao)}` : 'pedidos pagos, em carência'}
        />
        <Kpi rotulo="Já recebido" valor={formatarMoeda(saldos.recebido)} detalhe="soma dos repasses" />
      </div>

      <Card>
        <CardHeader
          titulo="Repasses recebidos"
          descricao={eu.chave_pix ? `Pagos por PIX na chave ${eu.chave_pix}.` : 'Pagos por PIX.'}
        />
        {pagamentos.length === 0 ? (
          <EmptyState
            icone={HandCoins}
            titulo="Nenhum repasse ainda"
            descricao="Quando a loja pagar as suas comissões, o repasse aparece aqui com o valor, a data e as vendas quitadas."
          />
        ) : (
          <ul className="divide-y divide-linha border-t border-linha">
            {pagamentos.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-4 px-4 py-4 lg:px-5">
                <div className="min-w-0">
                  <p className="tipo-dado font-semibold">{formatarData(p.pago_em)}</p>
                  <p className="mt-0.5 text-[13px] text-suave">
                    {p.vendas} venda(s) · comissões {formatarMoeda(p.comissoes)}
                  </p>
                  {p.ajuste !== 0 && (
                    <p className="mt-0.5 text-[13px] text-suave">
                      Ajuste de <span className="tipo-dado text-[13px] text-ink">{formatarMoeda(p.ajuste)}</span>
                      {p.ajuste_motivo && `: ${p.ajuste_motivo}`}
                    </p>
                  )}
                  {p.observacoes && <p className="mt-0.5 text-[13px] text-suave">{p.observacoes}</p>}
                  {p.chave_pix && <p className="tipo-dado mt-1 text-[11px] break-all text-sutil">PIX: {p.chave_pix}</p>}
                </div>
                <p className="tipo-numero shrink-0 text-[20px] leading-6">{formatarMoeda(p.total)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
