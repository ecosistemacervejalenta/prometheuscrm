import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, ShoppingBag } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { GraficoDeVendas } from '@/features/influenciadores/components/grafico-de-vendas'
import { SeletorDePeriodo, SeloSituacaoVenda } from '@/features/influenciadores/components/selos'
import { CartaoDoCupom } from '@/features/influenciadores/portal/components/formularios'
import { resumoDoPortal, vendasDoPortal } from '@/features/influenciadores/portal/queries'
import { exigirInfluenciador } from '@/features/influenciadores/portal/sessao'
import { formatarPercentual, linkDeDivulgacao } from '@/features/influenciadores/rotulos'
import { intervalosDoPeriodo, periodoValido } from '@/features/vendas/periodos'
import { hojeISO } from '@/lib/datas'
import { formatarData, formatarDataCurta, formatarMoeda, formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Início' }

export default async function PaginaInicioDoPortal({ searchParams }: PageProps<'/portal'>) {
  const busca = await searchParams
  const { influenciador: eu } = await exigirInfluenciador()
  const periodo = periodoValido(param(busca.periodo) ?? '30d')
  const { atual, descricao } = intervalosDoPeriodo(periodo, hojeISO())

  const [resumo, { vendas: ultimas, total: totalDeVendas }] = await Promise.all([
    resumoDoPortal(atual.inicio, atual.fim),
    vendasDoPortal({ porPagina: 5 }),
  ])

  const primeiroNome = eu.nome.trim().split(/\s+/)[0]
  const { saldos } = resumo
  const desconto = formatarPercentual(eu.desconto_percentual)
  const comissao = formatarPercentual(eu.comissao_percentual)

  return (
    <div className="space-y-5 lg:space-y-6">
      <header>
        <p className="tipo-dado text-[13px] text-suave">Parceiro desde {formatarData(eu.criado_em)}</p>
        <h1 className="tipo-h2 sm:tipo-h1 mt-0.5">Olá, {primeiroNome}</h1>
      </header>

      {eu.status !== 'ativo' && (
        <Alert tom="alerta" titulo={eu.status === 'pausado' ? 'Seu cupom está pausado' : 'Parceria encerrada'}>
          {eu.status === 'pausado'
            ? 'No momento o cupom não aplica desconto na loja. As vendas já feitas continuam valendo — fale com a loja para reativar.'
            : 'O cupom não vale mais na loja. Suas vendas, comissões e repasses continuam disponíveis aqui.'}
        </Alert>
      )}
      {!eu.chave_pix && (
        <Alert tom="info" titulo="Cadastre sua chave PIX">
          É por ela que a loja paga as suas comissões.{' '}
          <Link href="/portal/conta" className="font-semibold underline underline-offset-2">
            Cadastrar agora
          </Link>
        </Alert>
      )}

      <CartaoDoCupom
        cupom={eu.cupom}
        ativo={eu.cupom_ativo}
        desconto={desconto}
        comissao={comissao}
        link={linkDeDivulgacao(eu.loja_url, eu.cupom)}
        loja={eu.loja_nome}
      />

      <section aria-label="Suas comissões" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi
          rotulo="Disponível para receber"
          valor={formatarMoeda(saldos.disponivel)}
          detalhe={saldos.vendas_disponiveis > 0 ? `${saldos.vendas_disponiveis} venda(s) liberada(s)` : 'entra no próximo repasse'}
          destaque
          className="max-lg:col-span-2"
        />
        <Kpi
          rotulo="A liberar"
          valor={formatarMoeda(saldos.a_liberar)}
          detalhe={saldos.proxima_liberacao ? `próxima em ${formatarData(saldos.proxima_liberacao)}` : `libera ${eu.carencia_dias} dia(s) após o pedido`}
        />
        <Kpi rotulo="Aguardando pagamento" valor={formatarMoeda(saldos.aguardando)} detalhe="pedidos ainda não pagos" />
        <Kpi rotulo="Já recebido" valor={formatarMoeda(saldos.recebido)} detalhe="soma dos repasses" className="max-lg:col-span-2" />
      </section>

      <Card>
        <CardHeader titulo="Suas vendas" descricao={descricao} acoes={<SeletorDePeriodo ativo={periodo} caminho="/portal" opcoes={['7d', '30d', '90d', 'mes']} />} />
        <CardContent>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { rotulo: 'Pedidos', valor: formatarNumero(resumo.periodo.pedidos) },
              { rotulo: 'Vendido', valor: formatarMoeda(resumo.periodo.vendido) },
              { rotulo: 'Sua comissão', valor: formatarMoeda(resumo.periodo.comissao) },
            ].map((n) => (
              <div key={n.rotulo} className="rounded-xl bg-papel p-3">
                <p className="tipo-rotulo text-suave">{n.rotulo}</p>
                <p className="tipo-numero mt-0.5 truncate text-[17px] leading-6 sm:text-[20px]">{n.valor}</p>
              </div>
            ))}
          </div>
          <GraficoDeVendas serie={resumo.serie} intervalo={atual} vazio="Compartilhe o seu cupom: cada pedido feito com ele aparece aqui." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          titulo="Últimas vendas"
          acoes={totalDeVendas > 0 && <ButtonLink href="/portal/vendas" tamanho="sm">Ver todas</ButtonLink>}
        />
        {ultimas.length === 0 ? (
          <EmptyState
            icone={ShoppingBag}
            titulo="Nenhuma venda ainda"
            descricao="Quando alguém comprar na loja usando o seu cupom, o pedido aparece aqui em alguns minutos, com a sua comissão."
          />
        ) : (
          <ul className="divide-y divide-linha border-t border-linha">
            {ultimas.map((v) => (
              <li key={v.id}>
                <Link href="/portal/vendas" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-papel/60 lg:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="tipo-dado font-semibold">{v.pedido_numero ?? 'Pedido'}</span>
                      <SeloSituacaoVenda situacao={v.situacao} />
                    </p>
                    <p className="tipo-dado mt-0.5 text-[12px] text-suave">
                      {formatarDataCurta(v.pedido_em)} · {formatarMoeda(v.base)} em produtos
                    </p>
                  </div>
                  <p className="tipo-dado shrink-0 font-semibold">{formatarMoeda(v.comissao)}</p>
                  <ChevronRight className="-mr-1 size-4 shrink-0 text-sutil" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader titulo="Como funciona" />
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              { titulo: 'Divulgue', texto: `Quem usa o cupom ${eu.cupom} ganha ${desconto} de desconto na ${eu.loja_nome}.` },
              { titulo: 'A venda entra', texto: `Você ganha ${comissao} sobre os produtos do pedido (depois do desconto, sem contar o frete).` },
              {
                titulo: 'Você recebe',
                texto: `A comissão libera ${eu.carencia_dias === 0 ? 'assim que o pedido é pago' : `${eu.carencia_dias} dia(s) depois do pedido, se ele estiver pago`} e é paga por PIX.`,
              },
            ].map((passo, i) => (
              <li key={passo.titulo} className="rounded-xl bg-papel p-4">
                <span className="tipo-dado grid size-7 place-items-center rounded-full bg-ink text-[13px] text-white">{i + 1}</span>
                <p className="mt-2 font-semibold">{passo.titulo}</p>
                <p className="mt-0.5 text-[14px] text-ink/70">{passo.texto}</p>
              </li>
            ))}
          </ol>
          {eu.regras && (
            <div className="mt-4 rounded-xl border border-linha p-4">
              <p className="tipo-rotulo text-suave">Como e quando a loja paga</p>
              <p className="mt-1 text-[14px] whitespace-pre-wrap text-ink/80">{eu.regras}</p>
            </div>
          )}
          <p className="mt-4 text-[13px] text-suave">Pedido cancelado ou devolvido não gera comissão; devolução parcial reduz a comissão na mesma proporção.</p>
        </CardContent>
      </Card>
    </div>
  )
}
