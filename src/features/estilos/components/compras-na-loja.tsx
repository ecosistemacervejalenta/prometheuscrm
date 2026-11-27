import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatarData, formatarMoeda, formatarNumero } from '@/lib/format'

import { hrefDoFiltro } from '../schema'
import type { comprasNaLoja } from '../queries'

type Dados = Awaited<ReturnType<typeof comprasNaLoja>>

const SITUACAO: Record<string, string> = {
  pending: 'aguardando pagamento',
  refunded: 'estornado',
  voided: 'cancelado',
  expired: 'expirado',
}

/** Ficha do cliente: estilos e cervejarias que ele compra na loja da Shopify e os últimos pedidos. */
export function ComprasNaLoja({ dados }: { dados: Dados }) {
  if (dados.compras.length === 0) return null
  const estilos = dados.gosto.filter((g) => g.tipo === 'estilo').slice(0, 8)
  const cervejarias = dados.gosto.filter((g) => g.tipo === 'cervejaria').slice(0, 6)

  return (
    <Card>
      <CardHeader titulo="Na loja (Shopify)" descricao="O que este cliente compra, pelas collections da loja." />
      <CardContent className="space-y-4">
        {[
          { rotulo: 'Estilos', itens: estilos },
          { rotulo: 'Cervejarias', itens: cervejarias },
        ].map(
          (grupo) =>
            grupo.itens.length > 0 && (
              <div key={grupo.rotulo}>
                <p className="tipo-rotulo mb-1.5 text-suave">{grupo.rotulo}</p>
                <div className="flex flex-wrap gap-1.5">
                  {grupo.itens.map((g) => (
                    <Link key={g.colecao_id} href={hrefDoFiltro({ colecoes: [g.colecao_id] })} title={`Ver quem mais compra ${g.titulo}`}>
                      <Badge tom="volt" className="hover:ring-1 hover:ring-volt-700">
                        {g.titulo} · {formatarNumero(g.garrafas)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            ),
        )}

        <div>
          <p className="tipo-rotulo mb-1.5 text-suave">Últimos pedidos</p>
          <ul className="divide-y divide-linha rounded-xl border border-linha">
            {dados.compras.map((c) => {
              const unidades = c.shopify_compra_itens.reduce((s, i) => s + i.quantidade, 0)
              const situacao = c.cancelado ? 'cancelado' : !c.valida ? (SITUACAO[c.status_financeiro ?? ''] ?? 'não pago') : null
              return (
                <li key={c.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.numero ?? 'Pedido'}</span>
                    <span className="tipo-dado text-[13px]">{formatarMoeda(c.valor)}</span>
                  </div>
                  <p className="text-[12px] text-suave">
                    {formatarData(c.comprado_em)} · {formatarNumero(unidades)} {unidades === 1 ? 'item' : 'itens'}
                    {situacao && <span className="text-alerta"> · {situacao}</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-suave">
                    {c.shopify_compra_itens.map((i) => `${i.quantidade}× ${i.titulo}`).join(' · ')}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
