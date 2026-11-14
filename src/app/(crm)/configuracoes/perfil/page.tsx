import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Pilha } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { FotoPerfil } from '@/features/configuracoes/components/foto-perfil'
import { FormularioMeuPerfil } from '@/features/configuracoes/components/formularios'
import { exigirEquipe } from '@/lib/auth'

export const metadata: Metadata = { title: 'Meu perfil' }

export default async function PaginaMeuPerfil() {
  const { perfil } = await exigirEquipe()

  return (
    <>
      <CabecalhoSecao secao="perfil" selo={perfil.papel === 'admin' ? <Badge tom="escuro">Administrador</Badge> : <Badge>Equipe</Badge>} />
      <Pilha estreita>
        <Card>
          <CardHeader titulo="Foto" descricao="Aparece no menu e na lista da equipe." />
          <CardContent>
            <FotoPerfil nome={perfil.nome || perfil.email || 'Equipe'} foto={perfil.foto_url} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader titulo="Seus dados" descricao={perfil.email ?? undefined} />
          <CardContent>
            <FormularioMeuPerfil perfil={perfil} />
          </CardContent>
        </Card>
      </Pilha>
    </>
  )
}
