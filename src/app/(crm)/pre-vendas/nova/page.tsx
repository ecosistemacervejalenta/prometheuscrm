import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { salvarPreVenda } from '@/features/pre-vendas/actions'
import { FormularioPreVenda } from '@/features/pre-vendas/components/formulario-pre-venda'
import { opcoesProdutos } from '@/features/produtos/queries'

export const metadata: Metadata = { title: 'Nova pré-venda' }

export default async function PaginaNovaPreVenda() {
  const [produtos, config] = await Promise.all([opcoesProdutos(), obterConfiguracoes()])
  return (
    <>
      <PageHeader
        titulo="Nova pré-venda"
        descricao="Ao salvar, o link para disparar no WhatsApp é gerado na hora."
        voltar={{ href: '/pre-vendas', rotulo: 'Pré-vendas' }}
      />
      <FormularioPreVenda
        acao={salvarPreVenda.bind(null, null)}
        produtos={produtos}
        nomeLoja={config.nome_loja}
        freteVip={Number(config.frete_vip_valor)}
      />
    </>
  )
}
