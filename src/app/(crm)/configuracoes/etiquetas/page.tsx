import type { Metadata } from 'next'

import { Card, CardHeader } from '@/components/ui/card'
import { corSugerida } from '@/features/atendimento/components/etiqueta'
import { FormularioNovaEtiqueta, LinhaEtiqueta } from '@/features/atendimento/components/gerenciar-etiquetas'
import { listarEtiquetasComUso } from '@/features/atendimento/queries'
import { CabecalhoConfiguracoes } from '@/features/configuracoes/components/cabecalho'

export const metadata: Metadata = { title: 'Etiquetas' }

export default async function PaginaEtiquetas() {
  const etiquetas = await listarEtiquetasComUso()

  return (
    <>
      <CabecalhoConfiguracoes ativa="etiquetas" />
      <Card className="max-w-3xl">
        <CardHeader
          titulo="Etiquetas do atendimento"
          descricao="Dizem o que está sendo tratado em cada conversa e aparecem na lista do Atendimento. Também dá para criar uma na hora, pela própria conversa."
        />
        <FormularioNovaEtiqueta sugerida={corSugerida(etiquetas)} />
        {etiquetas.length > 0 ? (
          <ul className="divide-y divide-linha border-t border-linha">
            {etiquetas.map((e) => (
              <LinhaEtiqueta key={e.id} etiqueta={e} />
            ))}
          </ul>
        ) : (
          <p className="border-t border-linha px-4 py-8 text-center text-sm text-suave lg:px-5">Nenhuma etiqueta cadastrada ainda.</p>
        )}
      </Card>
    </>
  )
}
