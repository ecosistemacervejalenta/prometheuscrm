import { linkWhatsapp, mensagemCobranca } from '@/lib/whatsapp'
import type { Configuracoes } from '@/types'

/** Link do WhatsApp com a mensagem de cobrança já preenchida. */
export function linkDeCobranca(
  config: Configuracoes,
  pedido: {
    numero: number
    total: number
    taxa_entrega: number
    cliente: { nome: string; whatsapp: string | null } | null
    pre_venda_titulo?: string | null
    itens: Array<{ descricao: string; quantidade: number; total: number }>
  },
): string | null {
  if (!pedido.cliente?.whatsapp) return null
  const texto = mensagemCobranca(config, {
    numero: pedido.numero,
    total: pedido.total,
    taxa_entrega: pedido.taxa_entrega,
    cliente_nome: pedido.cliente.nome,
    pre_venda_titulo: pedido.pre_venda_titulo,
    itens: pedido.itens,
  })
  return linkWhatsapp(pedido.cliente.whatsapp, texto)
}
