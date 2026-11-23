import type { Metadata } from 'next'

import { ListaDeClientes } from '@/features/clientes/components/lista-clientes'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Clientes do Grupo VIP' }

export default async function PaginaClientesGrupoVip({ searchParams }: PageProps<'/clientes/grupo-vip'>) {
  const busca = await searchParams
  const pagina = Math.max(1, Number(param(busca.pagina) ?? 1) || 1)
  return <ListaDeClientes vip q={param(busca.q)} pagina={pagina} />
}
