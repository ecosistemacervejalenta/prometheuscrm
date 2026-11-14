import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { FormularioConfigAtendimento } from '@/features/atendimento/components/formulario-config'
import { configAtendimento } from '@/features/atendimento/queries'
import { Dado, Dados } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { exigirEquipe } from '@/lib/auth'

export const metadata: Metadata = { title: 'Preferências do atendimento' }

export default async function PaginaPreferenciasAtendimento() {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const config = await configAtendimento()

  return (
    <>
      <CabecalhoSecao
        secao="atendimento"
        somenteLeitura={!ehAdmin}
        selo={config.rodizio ? <Badge tom="sucesso" ponto>Rodízio ligado</Badge> : <Badge ponto>Rodízio desligado</Badge>}
      />
      {ehAdmin ? (
        <FormularioConfigAtendimento config={config} />
      ) : (
        <Card className="max-w-3xl">
          <CardContent className="pt-4 lg:pt-5">
            <Dados colunas={2}>
              <Dado rotulo="Rodízio da fila">
                {config.rodizio ? `Ligado${config.rodizioProximo ? ` · próximo: ${config.rodizioProximo}` : ''}` : 'Desligado'}
              </Dado>
              <Dado rotulo="Assinatura das mensagens">{config.assinatura ? 'Com o nome do responsável' : 'Sem assinatura'}</Dado>
              <Dado rotulo="Banco de Leads">
                {config.leadsAutomatico
                  ? `Salva sozinho${config.pastas.find((p) => p.id === config.pastaLeadsId) ? ` em “${config.pastas.find((p) => p.id === config.pastaLeadsId)?.nome}”` : ''}`
                  : 'Só pelo botão “Salvar” na conversa'}
              </Dado>
            </Dados>
          </CardContent>
        </Card>
      )}
    </>
  )
}
