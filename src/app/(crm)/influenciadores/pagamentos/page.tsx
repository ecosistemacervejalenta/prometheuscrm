import type { Metadata } from 'next'
import Link from 'next/link'
import { HandCoins, Undo2, Wallet } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { desfazerPagamento } from '@/features/influenciadores/actions'
import { AbasInfluenciadores, Cupom } from '@/features/influenciadores/components/selos'
import { influenciadoresAPagar, listarPagamentos } from '@/features/influenciadores/queries'
import { TIPOS_CHAVE_PIX, type TipoChavePix } from '@/features/influenciadores/rotulos'
import { exigirEquipe } from '@/lib/auth'
import { formatarData, formatarMoeda, formatarNumero } from '@/lib/format'

export const metadata: Metadata = { title: 'Repasses aos influenciadores' }

export default async function PaginaRepasses() {
  const { perfil } = await exigirEquipe()
  const [aPagar, pagamentos] = await Promise.all([influenciadoresAPagar(), listarPagamentos({ limite: 200 })])

  const totalAPagar = aPagar.reduce((s, i) => s + Number(i.saldo_disponivel ?? 0), 0)
  const emBreve = aPagar.reduce((s, i) => s + Number(i.saldo_a_liberar ?? 0), 0)
  const jaPago = pagamentos.reduce((s, p) => s + Number(p.total ?? 0), 0)
  const admin = perfil.papel === 'admin'

  return (
    <>
      <PageHeader titulo="Repasses" contexto="Comissões a pagar e já pagas aos influenciadores" />
      <AbasInfluenciadores ativa="pagamentos" aPagar={aPagar.length} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-3 lg:gap-4">
        <Kpi rotulo="A pagar agora" valor={formatarMoeda(totalAPagar)} detalhe={`${aPagar.length} influenciador(es)`} destaque />
        <Kpi rotulo="Liberam em breve" valor={formatarMoeda(emBreve)} detalhe="de quem já tem repasse liberado" />
        <Kpi rotulo="Já repassado" valor={formatarMoeda(jaPago)} detalhe={`${formatarNumero(pagamentos.length)} repasse(s)`} className="max-lg:col-span-2" />
      </div>

      <div className="space-y-5 lg:space-y-6">
        <Card>
          <CardHeader titulo="A pagar agora" descricao="Comissões de pedidos pagos que já passaram da carência. Faça o PIX e registre o repasse na ficha do influenciador." />
          {aPagar.length === 0 ? (
            <EmptyState icone={Wallet} titulo="Nenhum repasse liberado" descricao="Quando a comissão de alguém passar da carência, ele aparece aqui com o valor e a chave PIX." />
          ) : (
            <ul className="divide-y divide-linha border-t border-linha">
              {aPagar.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 lg:px-5">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/influenciadores/${i.id}`} className="truncate font-semibold hover:text-volt-700">{i.nome}</Link>
                      <Cupom codigo={i.cupom} />
                    </div>
                    <p className="mt-1 truncate text-[13px] text-suave">
                      {i.chave_pix ? (
                        <>
                          PIX ({TIPOS_CHAVE_PIX[i.tipo_chave_pix as TipoChavePix] ?? 'chave'}): <span className="tipo-dado text-[13px] text-ink">{i.chave_pix}</span>
                          {i.nome_recebedor && ` · ${i.nome_recebedor}`}
                        </>
                      ) : (
                        <span className="font-medium text-alerta">Sem chave PIX cadastrada</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tipo-numero text-[20px] leading-6">{formatarMoeda(i.saldo_disponivel)}</p>
                    <p className="tipo-dado text-[11px] text-suave">
                      {formatarNumero(i.vendas_disponiveis)} venda(s){i.ultimo_pagamento_em ? ` · último repasse ${formatarData(i.ultimo_pagamento_em)}` : ''}
                    </p>
                  </div>
                  <ButtonLink href={`/influenciadores/${i.id}#repasse`} variante="escuro" tamanho="sm" className="max-sm:w-full">
                    <HandCoins /> Registrar repasse
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader titulo="Repasses feitos" descricao="Os mais recentes primeiro. O influenciador vê cada repasse no Portal." />
          {pagamentos.length === 0 ? (
            <EmptyState icone={HandCoins} titulo="Nenhum repasse registrado ainda" />
          ) : (
            <>
              <ListaMobile>
                {pagamentos.map((p) => (
                  <ItemMobile
                    key={p.id}
                    href={`/influenciadores/${p.influenciador_id}`}
                    titulo={p.influenciadores?.nome ?? 'Influenciador'}
                    subtitulo={
                      <span className="tipo-dado text-[12px]">
                        {formatarData(p.pago_em)} · {p.vendas} venda(s){Number(p.ajuste) !== 0 ? ` · ajuste ${formatarMoeda(p.ajuste)}` : ''}
                      </span>
                    }
                    fim={<p className="tipo-dado text-[14px] font-semibold">{formatarMoeda(p.total)}</p>}
                  />
                ))}
              </ListaMobile>
              <Table somenteDesktop>
                <THead>
                  <TR>
                    <TH>Data</TH>
                    <TH>Influenciador</TH>
                    <TH className="text-right">Vendas</TH>
                    <TH className="text-right">Comissões</TH>
                    <TH className="text-right">Ajuste</TH>
                    <TH className="text-right">Total pago</TH>
                    <TH>Observação</TH>
                    {admin && <TH><span className="sr-only">Ações</span></TH>}
                  </TR>
                </THead>
                <TBody>
                  {pagamentos.map((p) => (
                    <TR key={p.id} className="hover:bg-papel/60">
                      <TD className="tipo-dado whitespace-nowrap">{formatarData(p.pago_em)}</TD>
                      <TD>
                        <Link href={`/influenciadores/${p.influenciador_id}`} className="font-medium hover:text-volt-700">
                          {p.influenciadores?.nome ?? 'Influenciador'}
                        </Link>
                        {p.perfis?.nome && <p className="text-[12px] text-suave">registrado por {p.perfis.nome}</p>}
                      </TD>
                      <TD className="tipo-dado text-right">{p.vendas}</TD>
                      <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(p.comissoes)}</TD>
                      <TD className="tipo-dado text-right whitespace-nowrap">
                        {Number(p.ajuste) === 0 ? <span className="text-sutil">—</span> : formatarMoeda(p.ajuste)}
                      </TD>
                      <TD className="tipo-dado text-right font-semibold whitespace-nowrap">{formatarMoeda(p.total)}</TD>
                      <TD className="max-w-[280px] text-[13px] text-suave">
                        {[p.ajuste_motivo, p.observacoes].filter(Boolean).join(' · ') || '—'}
                      </TD>
                      {admin && (
                        <TD className="text-right">
                          <ActionButton
                            acao={desfazerPagamento.bind(null, p.id)}
                            variante="fantasma"
                            titulo="Desfazer este repasse"
                            confirmar={`Desfazer o repasse de ${formatarMoeda(p.total)} para ${p.influenciadores?.nome ?? 'o influenciador'}? As comissões voltam a ficar disponíveis e o repasse some do Portal dele.`}
                          >
                            <Undo2 aria-hidden />
                          </ActionButton>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
