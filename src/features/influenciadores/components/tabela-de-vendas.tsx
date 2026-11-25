import { RotateCcw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { ActionButton } from '@/components/ui/action-button'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatarData, formatarDataCurta, formatarHora, formatarMoeda } from '@/lib/format'
import type { VendaInfluenciadorDetalhe } from '@/types'

import { restaurarComissao } from '../actions'
import { formatarPercentual, situacaoDaVenda } from '../rotulos'
import { BotaoCancelarComissao } from './acoes'
import { Cupom, SeloSituacaoVenda } from './selos'

/** Explicação curta ao lado da situação: quando libera, por que foi cancelada, alerta pós-repasse. */
function Detalhe({ v }: { v: VendaInfluenciadorDetalhe }) {
  const situacao = situacaoDaVenda(v.situacao)
  if (v.alerta) {
    return (
      <p className={`mt-1 flex items-start gap-1 text-[12px] leading-4 ${situacao === 'paga' ? 'text-alerta' : 'text-suave'}`}>
        {situacao === 'paga' && <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
        {v.alerta}
      </p>
    )
  }
  if (situacao === 'a_liberar') return <p className="mt-1 text-[12px] text-suave">libera em {formatarData(v.liberar_em)}</p>
  return null
}

/**
 * Vendas com cupom: tabela no desktop, lista no celular.
 * `comInfluenciador`: mostra de quem é a venda (telas gerais). `comAcoes`: cancelar/restaurar a comissão.
 */
export function TabelaDeVendas({
  vendas,
  comInfluenciador = false,
  comAcoes = false,
}: {
  vendas: VendaInfluenciadorDetalhe[]
  comInfluenciador?: boolean
  comAcoes?: boolean
}) {
  const acoes = (v: VendaInfluenciadorDetalhe) => {
    if (!comAcoes || !v.id) return null
    if (v.bloqueada) {
      return (
        <ActionButton acao={restaurarComissao.bind(null, v.id)} variante="fantasma" titulo="Devolver a comissão desta venda">
          <RotateCcw aria-hidden />
          <span className="sr-only lg:not-sr-only">Restaurar</span>
        </ActionButton>
      )
    }
    return v.status === 'pendente' || v.status === 'aprovada' ? <BotaoCancelarComissao vendaId={v.id} pedido={v.pedido_numero ?? ''} /> : null
  }
  const pedido = (v: VendaInfluenciadorDetalhe) => v.pedido_numero ?? `Pedido ${v.shopify_order_id ?? ''}`

  return (
    <>
      <ListaMobile>
        {vendas.map((v) => (
          <ItemMobile
            key={v.id}
            titulo={
              <span className="flex items-center gap-2">
                <span className="tipo-dado">{pedido(v)}</span>
                {comInfluenciador && <span className="truncate font-medium text-suave">{v.influenciador_nome}</span>}
              </span>
            }
            subtitulo={
              <span className="tipo-dado text-[12px]">
                {formatarDataCurta(v.pedido_em)} {formatarHora(v.pedido_em)} · {formatarMoeda(v.base)} × {formatarPercentual(v.percentual)}
              </span>
            }
            extra={
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeloSituacaoVenda situacao={v.situacao} />
                  {acoes(v)}
                </div>
                <Detalhe v={v} />
              </div>
            }
            fim={<p className="tipo-dado text-[14px] font-semibold">{formatarMoeda(v.comissao)}</p>}
          />
        ))}
      </ListaMobile>
      <Table somenteDesktop>
        <THead>
          <TR>
            <TH>Pedido</TH>
            {comInfluenciador && <TH>Influenciador</TH>}
            <TH className="text-right">Produtos</TH>
            <TH className="text-right">%</TH>
            <TH className="text-right">Comissão</TH>
            <TH>Situação</TH>
            {comAcoes && <TH><span className="sr-only">Ações</span></TH>}
          </TR>
        </THead>
        <TBody>
          {vendas.map((v) => (
            <TR key={v.id} className="hover:bg-papel/60">
              <TD>
                {v.pedido_id ? (
                  <Link href={`/pedidos/${v.pedido_id}`} className="tipo-dado font-semibold hover:text-volt-700">{pedido(v)}</Link>
                ) : (
                  <span className="tipo-dado font-semibold">{pedido(v)}</span>
                )}
                <p className="tipo-dado text-[11px] text-suave">
                  {formatarDataCurta(v.pedido_em)} · {formatarHora(v.pedido_em)}
                </p>
              </TD>
              {comInfluenciador && (
                <TD>
                  <Link href={`/influenciadores/${v.influenciador_id}`} className="font-medium hover:text-volt-700">{v.influenciador_nome}</Link>
                  <div className="mt-0.5"><Cupom codigo={v.cupom} /></div>
                </TD>
              )}
              <TD className="tipo-dado text-right whitespace-nowrap">
                {formatarMoeda(v.base)}
                {Number(v.desconto) > 0 && <p className="text-[11px] text-suave">desc. {formatarMoeda(v.desconto)}</p>}
              </TD>
              <TD className="tipo-dado text-right">{formatarPercentual(v.percentual)}</TD>
              <TD className="tipo-dado text-right font-semibold whitespace-nowrap">{formatarMoeda(v.comissao)}</TD>
              <TD className="max-w-[260px]">
                <SeloSituacaoVenda situacao={v.situacao} />
                <Detalhe v={v} />
              </TD>
              {comAcoes && <TD className="text-right">{acoes(v)}</TD>}
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  )
}
