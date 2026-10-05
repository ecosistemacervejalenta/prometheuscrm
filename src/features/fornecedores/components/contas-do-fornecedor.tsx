import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { contasDoFornecedor } from '@/features/contas/queries'
import { SITUACAO_CONTA } from '@/lib/rotulos'
import { formatarData, formatarMoeda } from '@/lib/format'
import { hojeISO } from '@/lib/datas'

/** Resumo e últimas contas a pagar de um fornecedor, exibido na ficha dele. */
export async function ContasDoFornecedor({ fornecedorId }: { fornecedorId: string }) {
  const { emAberto, qtdEmAberto, qtdVencidas, pagoUltimos12Meses, recentes, total } = await contasDoFornecedor(
    fornecedorId,
    hojeISO(),
  )

  if (total === 0) {
    return (
      <Card>
        <CardHeader titulo="Contas deste fornecedor" descricao="Nenhuma conta lançada para esta empresa ainda." />
      </Card>
    )
  }

  const descricao =
    `${formatarMoeda(emAberto)} em aberto (${qtdEmAberto} conta(s))` +
    (qtdVencidas > 0 ? ` · ${qtdVencidas} vencida(s)` : '') +
    ` · ${formatarMoeda(pagoUltimos12Meses)} pago nos últimos 12 meses`

  return (
    <Card>
      <CardHeader titulo="Contas deste fornecedor" descricao={descricao} />
      <ListaMobile>
        {recentes.map((c) => {
          const situacao = SITUACAO_CONTA[c.situacao ?? 'em_dia']
          return (
            <ItemMobile
              key={c.id}
              href={`/contas/${c.id}/editar`}
              titulo={c.descricao ?? ''}
              subtitulo={`${c.categoria} · vence ${formatarData(c.vencimento)}`}
              fim={
                <>
                  <p className="tipo-dado text-[15px]">{formatarMoeda(c.valor)}</p>
                  <div className="mt-1">
                    <Badge tom={situacao.tom} ponto>
                      {situacao.rotulo}
                    </Badge>
                  </div>
                </>
              }
            />
          )
        })}
      </ListaMobile>
      <Table somenteDesktop>
        <THead>
          <TR>
            <TH>Conta</TH>
            <TH>Vencimento</TH>
            <TH className="text-right">Valor</TH>
            <TH>Situação</TH>
          </TR>
        </THead>
        <TBody>
          {recentes.map((c) => {
            const situacao = SITUACAO_CONTA[c.situacao ?? 'em_dia']
            return (
              <TR key={c.id}>
                <TD>
                  <Link href={`/contas/${c.id}/editar`} className="font-semibold hover:text-volt-700">
                    {c.descricao}
                  </Link>
                  <p className="text-[13px] text-suave">{c.categoria}</p>
                </TD>
                <TD className="tipo-dado text-[13px] whitespace-nowrap">{formatarData(c.vencimento)}</TD>
                <TD className="tipo-dado text-right whitespace-nowrap">{formatarMoeda(c.valor)}</TD>
                <TD>
                  <Badge tom={situacao.tom} ponto>
                    {situacao.rotulo}
                  </Badge>
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
    </Card>
  )
}
