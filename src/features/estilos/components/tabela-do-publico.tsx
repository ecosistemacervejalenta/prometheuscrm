import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatarData, formatarNumero, formatarWhatsapp } from '@/lib/format'

import type { ClienteDoPublico } from '../queries'

const cidade = (c: ClienteDoPublico) => [c.cidade, c.uf].filter(Boolean).join(' / ') || '—'
const garrafas = (n: number) => `${formatarNumero(n)} ${n === 1 ? 'garrafa' : 'garrafas'}`

/** Clientes do público: o que compraram das collections escolhidas, quanto e quando. */
export function TabelaDoPublico({ clientes }: { clientes: ClienteDoPublico[] }) {
  return (
    <>
      <Table somenteDesktop>
        <THead>
          <TR>
            <TH>Cliente</TH>
            <TH>WhatsApp</TH>
            <TH>Comprou</TH>
            <TH className="text-right">Garrafas</TH>
            <TH className="text-right">Pedidos</TH>
            <TH>Última compra</TH>
          </TR>
        </THead>
        <TBody>
          {clientes.map((c) => (
            <TR key={c.cliente_id}>
              <TD>
                <Link href={`/clientes/${c.cliente_id}`} className="font-semibold hover:underline">
                  {c.nome}
                </Link>
                <p className="text-[12px] text-suave">{cidade(c)}</p>
              </TD>
              <TD className="whitespace-nowrap">
                {c.whatsapp ? <span className="tipo-dado text-[13px]">{formatarWhatsapp(c.whatsapp)}</span> : <span className="text-suave">—</span>}
                {!c.recebe_campanha && (
                  <Badge tom="alerta" className="ml-2">
                    {c.whatsapp ? 'não recebe' : 'sem WhatsApp'}
                  </Badge>
                )}
              </TD>
              <TD className="max-w-[280px]">
                <span className="line-clamp-2 text-[13px]">{c.colecoes.join(', ')}</span>
              </TD>
              <TD className="tipo-dado text-right">{formatarNumero(c.garrafas)}</TD>
              <TD className="tipo-dado text-right">
                {formatarNumero(c.pedidos)}
                {c.pedidos_na_loja > c.pedidos && <span className="text-suave"> de {formatarNumero(c.pedidos_na_loja)}</span>}
              </TD>
              <TD className="whitespace-nowrap">{formatarData(c.ultima_compra)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <ListaMobile>
        {clientes.map((c) => (
          <ItemMobile
            key={c.cliente_id}
            href={`/clientes/${c.cliente_id}`}
            titulo={c.nome}
            subtitulo={`${garrafas(c.garrafas)} · ${c.colecoes.join(', ')}`}
            fim={
              <span className="text-[12px] text-suave">
                {formatarData(c.ultima_compra)}
                {!c.recebe_campanha && (
                  <Badge tom="alerta" className="mt-1">
                    {c.whatsapp ? 'não recebe' : 'sem WhatsApp'}
                  </Badge>
                )}
              </span>
            }
          />
        ))}
      </ListaMobile>
    </>
  )
}
