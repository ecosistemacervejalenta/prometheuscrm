import type { Metadata } from 'next'

import { Pilha } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { FormularioDadosLoja } from '@/features/configuracoes/components/formularios'
import { obterConfiguracoes } from '@/features/configuracoes/queries'

export const metadata: Metadata = { title: 'Dados da loja' }

export default async function PaginaDadosLoja() {
  const config = await obterConfiguracoes()

  return (
    <>
      <CabecalhoSecao secao="loja" />
      <Pilha estreita>
        <FormularioDadosLoja config={config} />
      </Pilha>
    </>
  )
}
