import type { Metadata } from 'next'

import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { FormularioMensagens, type ExemplosMensagens } from '@/features/configuracoes/components/formularios'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { basePagamentoPix } from '@/features/mercado-pago/queries'
import { formatarMoeda, numeroPedido } from '@/lib/format'
import { urlDoSite } from '@/lib/url'
import { textoPagamento } from '@/lib/whatsapp'

export const metadata: Metadata = { title: 'Mensagens' }

export default async function PaginaMensagens() {
  const [config, site, basePix] = await Promise.all([obterConfiguracoes(), urlDoSite(), basePagamentoPix()])

  // Dados de exemplo da prévia. O bloco {pagamento} sai como a loja está hoje (Mercado Pago ou chave PIX).
  const exemplos: ExemplosMensagens = {
    pre_venda: {
      titulo: 'Drop de Novembro',
      descricao: 'Seis rótulos frescos, direto da cervejaria.',
      link: `${site}/p/drop-de-novembro`,
      encerra_em: '30/11/2026',
      entrega: '10/12/2026',
    },
    cobranca: {
      nome: 'Ana',
      pedido: numeroPedido(1042).replace('#', ''),
      pre_venda: ' (Drop de Novembro)',
      itens: [`• 2× IPA da casa — ${formatarMoeda(58)}`, `• 1× Stout de café — ${formatarMoeda(34)}`, `• Entrega — ${formatarMoeda(15)}`].join('\n'),
      total: formatarMoeda(107),
      pagamento: textoPagamento(config, basePix ? `${basePix}1042` : null),
      pix: config.chave_pix ?? '',
    },
  }

  return (
    <>
      <CabecalhoSecao secao="mensagens" />
      <FormularioMensagens config={config} exemplos={exemplos} />
    </>
  )
}
