import type { Metadata } from 'next'

import { PageHeader } from '@/components/ui/page-header'
import { NovaCampanha } from '@/features/campanhas/components/nova-campanha'
import { listasParaCampanha, statusMeta } from '@/features/campanhas/queries'
import { obterConfiguracoes } from '@/features/configuracoes/queries'

export const metadata: Metadata = { title: 'Nova campanha' }

export default async function PaginaNovaCampanha() {
  const [listas, config] = await Promise.all([listasParaCampanha(), obterConfiguracoes()])
  // O envio pela Meta ainda não foi ligado: a tela fica pronta e o botão de disparo, bloqueado.
  const bloqueio = statusMeta().configurado
    ? 'O envio pela Meta é ligado na próxima etapa da integração.'
    : 'Conecte o WhatsApp oficial (API da Meta) para liberar o disparo.'

  return (
    <>
      <PageHeader
        titulo="Nova campanha"
        contexto="WhatsApp oficial · API da Meta"
        voltar={{ href: '/campanhas', rotulo: 'Campanhas' }}
      />
      <NovaCampanha listas={listas} nomeLoja={config.nome_loja} bloqueio={bloqueio} />
    </>
  )
}
