import { PageHeader } from '@/components/ui/page-header'
import { TabsLinks } from '@/components/ui/tabs'

export function CabecalhoConfiguracoes({ ativa }: { ativa: 'loja' | 'integracoes' | 'equipe' }) {
  return (
    <>
      <PageHeader titulo="Configurações" contexto="Loja, mensagens, integrações e equipe" />
      <TabsLinks
        ativa={ativa}
        abas={[
          { chave: 'loja', href: '/configuracoes', rotulo: 'Loja e mensagens' },
          { chave: 'integracoes', href: '/configuracoes/integracoes', rotulo: 'Integrações' },
          { chave: 'equipe', href: '/configuracoes/equipe', rotulo: 'Equipe' },
        ]}
      />
    </>
  )
}
