import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/ui/page-header'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { salvarPreVenda } from '@/features/pre-vendas/actions'
import { FormularioPreVenda } from '@/features/pre-vendas/components/formulario-pre-venda'
import { obterPreVendaParaEdicao } from '@/features/pre-vendas/queries'
import { opcoesProdutos, produtosPorIds } from '@/features/produtos/queries'
import { isoParaLocal } from '@/lib/datas'

export const metadata: Metadata = { title: 'Editar pré-venda' }

export default async function PaginaEditarPreVenda({ params }: PageProps<'/pre-vendas/[id]/editar'>) {
  const { id } = await params
  const [preVenda, produtosAtivos, config] = await Promise.all([obterPreVendaParaEdicao(id), opcoesProdutos(), obterConfiguracoes()])
  if (!preVenda) notFound()

  // Mantém na lista produtos já ofertados mesmo que tenham sido desativados depois.
  const idsAtivos = new Set(produtosAtivos.map((p) => p.id))
  const faltantes = preVenda.pre_venda_itens.filter((i) => !idsAtivos.has(i.produto_id))
  const produtos = [...produtosAtivos]
  const inativos = await produtosPorIds(faltantes.map((f) => f.produto_id))
  produtos.push(...inativos)

  return (
    <>
      <PageHeader titulo={`Editar · ${preVenda.titulo}`} voltar={{ href: `/pre-vendas/${id}`, rotulo: 'Pré-venda' }} />
      <FormularioPreVenda
        acao={salvarPreVenda.bind(null, id)}
        produtos={produtos}
        preVenda={preVenda}
        itensIniciais={preVenda.pre_venda_itens}
        encerraEmLocal={isoParaLocal(preVenda.encerra_em)}
        nomeLoja={config.nome_loja}
        freteVip={Number(config.frete_vip_valor)}
      />
    </>
  )
}
