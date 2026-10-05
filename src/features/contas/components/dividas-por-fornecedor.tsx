'use client'

import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import { useState } from 'react'

import { GraficoPizza, type FatiaPizza } from '@/components/graficos/grafico-pizza'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatarDataCurta, formatarMoeda, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { DividaFornecedor } from '../queries'

/** Paleta categórica validada (daltonismo e contraste) — uma cor fixa por fornecedor. */
const PALETA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7']
const COR_OUTROS = '#9aa1ad'
const LINHAS_INICIAIS = 10

type Visao = 'total' | 'mes'

const porcentagem = (p: number) => `${(p * 100).toLocaleString('pt-BR', { maximumFractionDigits: p > 0 && p < 0.1 ? 1 : 0 })}%`

/**
 * Quanto devemos a cada fornecedor: pizza (os 7 maiores + "Outros") e ranking completo,
 * do maior para o menor. As cores seguem o fornecedor (definidas pelo total em aberto),
 * então trocar de visão não "repinta" ninguém.
 */
export function DividasPorFornecedor({
  total,
  mes,
  nomeDoMes,
}: {
  total: DividaFornecedor[]
  mes: DividaFornecedor[]
  nomeDoMes: string
}) {
  const [visao, setVisao] = useState<Visao>('total')
  const [ativa, setAtiva] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)

  const cores = new Map(total.slice(0, PALETA.length).map((f, i) => [f.id, PALETA[i]]))
  const lista = visao === 'total' ? total : mes
  const soma = lista.reduce((s, f) => s + f.valor, 0)
  const maior = lista[0]?.valor ?? 0

  const comCor = lista.filter((f) => cores.has(f.id))
  const restantes = lista.filter((f) => !cores.has(f.id))
  // Só agrupa em "Outros" quando sobra mais de um fornecedor (um sozinho aparece com o próprio nome).
  const agrupar = restantes.length > 1
  const grupoDe = (f: DividaFornecedor) => (cores.has(f.id) || !agrupar ? f.id : 'outros')
  const fatias: FatiaPizza[] = [
    ...comCor.map((f) => ({ id: f.id, nome: f.nome, cor: cores.get(f.id)!, valor: f.valor, quantidade: f.contas })),
    ...(!agrupar
      ? restantes.map((f) => ({ id: f.id, nome: f.nome, cor: COR_OUTROS, valor: f.valor, quantidade: f.contas }))
      : [
          {
            id: 'outros',
            nome: `Outros (${restantes.length})`,
            cor: COR_OUTROS,
            valor: restantes.reduce((s, f) => s + f.valor, 0),
            quantidade: restantes.reduce((s, f) => s + f.contas, 0),
          },
        ]),
  ]
  const visiveis = verTodos ? lista : lista.slice(0, LINHAS_INICIAIS)

  return (
    <Card>
      <CardHeader
        titulo="Quanto devemos por fornecedor"
        descricao={
          lista.length
            ? `${formatarMoeda(soma)} em ${formatarNumero(lista.reduce((s, f) => s + f.contas, 0))} conta(s) pendente(s) · ${lista.length} fornecedor(es)`
            : 'Nenhuma conta pendente.'
        }
        acoes={
          <div className="flex rounded-lg border border-linha bg-papel p-0.5" role="group" aria-label="Período">
            {(
              [
                ['total', 'Total em aberto'],
                ['mes', nomeDoMes],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                type="button"
                aria-pressed={visao === chave}
                onClick={() => {
                  setVisao(chave)
                  setAtiva(null)
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors',
                  visao === chave ? 'bg-superficie text-ink shadow-cartao ring-1 ring-linha' : 'text-suave hover:text-ink',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        }
      />
      <CardContent>
        {lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-linha-forte px-4 py-8 text-center text-[13px] text-suave">
            {visao === 'total' ? 'Nada a pagar: todas as contas estão quitadas.' : `Nenhuma conta pendente em ${nomeDoMes.toLowerCase()}.`}
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
            <div className="flex justify-center lg:block">
              <GraficoPizza
                fatias={fatias}
                rotuloQuantidade="contas"
                rotuloGrafico="Participação de cada fornecedor no valor a pagar"
                mostrarLegenda={false}
                ativa={ativa}
                aoAtivar={setAtiva}
              />
            </div>

            <div className="min-w-0">
              <ol className="divide-y divide-linha" aria-label="Fornecedores do maior para o menor valor a pagar">
                {visiveis.map((f, i) => {
                  const grupo = grupoDe(f)
                  const cor = cores.get(f.id) ?? COR_OUTROS
                  const nome =
                    f.id === 'sem' ? (
                      <span className="italic">{f.nome}</span>
                    ) : (
                      <Link href={`/fornecedores/${f.id}/editar`} className="hover:text-volt-700">
                        {f.nome}
                      </Link>
                    )
                  return (
                    <li
                      key={f.id}
                      onPointerEnter={() => setAtiva(grupo)}
                      onPointerLeave={() => setAtiva(null)}
                      className={cn('py-2.5 transition-opacity', ativa && ativa !== grupo && 'opacity-45')}
                    >
                      <div className="flex items-start gap-3 sm:items-center">
                        <span className="tipo-dado w-5 shrink-0 text-right text-[12px] leading-5 text-sutil">{i + 1}</span>
                        <span className="mt-[5px] size-2.5 shrink-0 rounded-[3px] sm:mt-0" style={{ background: cor }} aria-hidden />
                        {/* No celular o nome pode quebrar em 2 linhas; no desktop, 1 linha com reticências. */}
                        <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-5 font-semibold break-words text-ink sm:line-clamp-1">{nome}</span>
                        <span className="tipo-dado shrink-0 text-[14px] leading-5 font-semibold text-ink">{formatarMoeda(f.valor)}</span>
                        <span className="tipo-dado hidden w-11 shrink-0 text-right text-[12px] text-suave sm:block">{porcentagem(soma ? f.valor / soma : 0)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 pl-[52px]">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-papel">
                          <div className="h-full rounded-full" style={{ width: `${maior ? (f.valor / maior) * 100 : 0}%`, background: cor }} />
                        </div>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-[52px] text-[12px] text-suave">
                        <span className="tipo-dado sm:hidden">{porcentagem(soma ? f.valor / soma : 0)}</span>
                        <span>{formatarNumero(f.contas)} conta(s)</span>
                        {f.vencido > 0 && (
                          <span className="inline-flex items-center gap-1 font-semibold text-perigo">
                            <CircleAlert className="size-3" aria-hidden /> {formatarMoeda(f.vencido)} vencido
                          </span>
                        )}
                        {f.proximoVencimento && <span>próximo vencimento {formatarDataCurta(f.proximoVencimento)}</span>}
                      </p>
                    </li>
                  )
                })}
              </ol>
              {lista.length > LINHAS_INICIAIS && (
                <button
                  type="button"
                  onClick={() => setVerTodos(!verTodos)}
                  className="mt-2 text-[13px] font-semibold text-volt-700 hover:text-ink"
                >
                  {verTodos ? 'Mostrar só os 10 maiores' : `Ver todos os ${lista.length} fornecedores`}
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
