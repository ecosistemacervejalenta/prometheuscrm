import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { NovaCampanha } from '@/features/campanhas/components/nova-campanha'
import { conexaoMeta, listasParaCampanha } from '@/features/campanhas/queries'
import { obterConfiguracoes } from '@/features/configuracoes/queries'

export const metadata: Metadata = { title: 'Nova campanha' }

export default async function PaginaNovaCampanha() {
  const [listas, config, conexao] = await Promise.all([listasParaCampanha(), obterConfiguracoes(), conexaoMeta()])

  return (
    <>
      <PageHeader titulo="Nova campanha" contexto="WhatsApp oficial · API da Meta" voltar={{ href: '/campanhas', rotulo: 'Campanhas' }} />
      <NovaCampanha
        listas={listas}
        nomeLoja={conexao.nome_verificado ?? config.nome_loja}
        limiteTier={conexao.limite_tier}
        bloqueio={conexao.configurado ? null : 'Conecte o WhatsApp oficial (API da Meta) para liberar o disparo.'}
      />
    </>
  )
}
