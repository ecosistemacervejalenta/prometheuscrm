import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { criarInfluenciador } from '@/features/influenciadores/actions'
import { FormularioInfluenciador } from '@/features/influenciadores/components/formularios'
import { AvisoDaShopify } from '@/features/influenciadores/components/shopify'
import { integracaoDoPrograma, regrasDoPrograma } from '@/features/influenciadores/queries'
import { hojeISO } from '@/lib/datas'

export const metadata: Metadata = { title: 'Novo influenciador' }

export default async function PaginaNovoInfluenciador() {
  const [integracao, regras] = await Promise.all([integracaoDoPrograma(), regrasDoPrograma()])

  return (
    <>
      <PageHeader
        titulo="Novo influenciador"
        descricao="Cadastre a pessoa, escolha o cupom e a comissão. As vendas feitas com o cupom passam a ser contadas para ela."
        voltar={{ href: '/influenciadores/lista', rotulo: 'Influenciadores' }}
      />
      <AvisoDaShopify integracao={integracao} />
      <FormularioInfluenciador
        acao={criarInfluenciador}
        padroes={{ comissao: regras.comissao_padrao, desconto: regras.desconto_padrao, criaCupomSozinho: integracao.cupons }}
        hoje={hojeISO()}
      />
    </>
  )
}
