import { PageHeader } from '@/components/ui/page-header'
import { TabsLinks } from '@/components/ui/tabs'

export function CabecalhoConfiguracoes({ ativa }: { ativa: 'loja' | 'frete' | 'integracoes' | 'equipe' }) {
  return (
    <>
      <PageHeader titulo="Configurações" contexto="Loja, mensagens, frete, integrações e equipe" />
      <TabsLinks
        ativa={ativa}
        abas={[
          { chave: 'loja', href: '/configuracoes', rotulo: 'Loja e mensagens' },
          { chave: 'frete', href: '/configuracoes/frete', rotulo: 'Frete VIP' },
          { chave: 'integracoes', href: '/configuracoes/integracoes', rotulo: 'Integrações' },
          { chave: 'equipe', href: '/configuracoes/equipe', rotulo: 'Equipe' },
        ]}
      />
    </>
  )
}
