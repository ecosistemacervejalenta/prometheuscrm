import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { NovaCampanha } from '@/features/campanhas/components/nova-campanha'
import { precoDaConexao } from '@/features/campanhas/custo'
import { conexaoMeta, listasParaCampanha } from '@/features/campanhas/queries'
import { obterConfiguracoes } from '@/features/configuracoes/queries'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Nova campanha' }

// As ações desta página falam com a Meta (criação do modelo, foto, verificação): até 5 min.
export const maxDuration = 300

export default async function PaginaNovaCampanha({ searchParams }: PageProps<'/campanhas/nova'>) {
  const [listas, config, conexao] = await Promise.all([listasParaCampanha(), obterConfiguracoes(), conexaoMeta()])
  // ?lista=<id>: vem de "Criar campanha com esta lista" (ex.: Clientes › Por estilo).
  const pedida = param((await searchParams).lista)
  const listaInicial = listas.some((l) => l.id === pedida) ? pedida : undefined

  return (
    <>
      <PageHeader titulo="Nova campanha" contexto="WhatsApp oficial · API da Meta" voltar={{ href: '/campanhas', rotulo: 'Campanhas' }} />
      <NovaCampanha
        listas={listas}
        listaInicial={listaInicial}
        nomeLoja={conexao.nome_verificado ?? config.nome_loja}
        limiteTier={conexao.limite_tier}
        preco={precoDaConexao(conexao)}
        bloqueio={conexao.configurado ? null : 'Conecte o WhatsApp oficial (API da Meta) para liberar o disparo.'}
      />
    </>
  )
}
