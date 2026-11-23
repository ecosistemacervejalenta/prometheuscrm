import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ListaDeClientes } from '@/features/clientes/components/lista-clientes'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Clientes' }

export default async function PaginaClientes({ searchParams }: PageProps<'/clientes'>) {
  const busca = await searchParams
  const q = param(busca.q)
  // Endereço antigo do filtro "Só VIP" → página Clientes › Grupo VIP.
  if (param(busca.vip) === '1') redirect(q ? `/clientes/grupo-vip?q=${encodeURIComponent(q)}` : '/clientes/grupo-vip')
  const pagina = Math.max(1, Number(param(busca.pagina) ?? 1) || 1)
  return <ListaDeClientes vip={false} q={q} pagina={pagina} />
}
