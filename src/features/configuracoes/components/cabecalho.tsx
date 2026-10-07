import { PageHeader } from '@/components/ui/page-header'
import { TabsLinks } from '@/components/ui/tabs'

export function CabecalhoConfiguracoes({
  ativa,
}: {
  ativa: 'loja' | 'frete' | 'etiquetas' | 'integracoes' | 'whatsapp-oficial' | 'equipe'
}) {
  return (
    <>
      <PageHeader titulo="Configurações" contexto="Loja, mensagens, frete, etiquetas, integrações, WhatsApp oficial e equipe" />
      <TabsLinks
        ativa={ativa}
        abas={[
          { chave: 'loja', href: '/configuracoes', rotulo: 'Loja e mensagens' },
          { chave: 'frete', href: '/configuracoes/frete', rotulo: 'Frete VIP' },
          { chave: 'etiquetas', href: '/configuracoes/etiquetas', rotulo: 'Etiquetas' },
          { chave: 'integracoes', href: '/configuracoes/integracoes', rotulo: 'Integrações' },
          { chave: 'whatsapp-oficial', href: '/configuracoes/whatsapp-oficial', rotulo: 'WhatsApp oficial' },
          { chave: 'equipe', href: '/configuracoes/equipe', rotulo: 'Equipe' },
        ]}
      />
    </>
  )
}
