import type { Metadata } from 'next'

import { CascaDoPortal } from '@/features/influenciadores/portal/components/casca'
import { exigirInfluenciador } from '@/features/influenciadores/portal/sessao'

export const metadata: Metadata = { title: { default: 'Portal de parceiros', template: '%s · Portal de parceiros' } }

export default async function LayoutDoPortal({ children }: LayoutProps<'/portal'>) {
  const { influenciador } = await exigirInfluenciador()
  return (
    <CascaDoPortal loja={influenciador.loja_nome} nome={influenciador.nome}>
      {children}
    </CascaDoPortal>
  )
}
