import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { ZonaDeRisco } from '@/features/configuracoes/components/blocos'
import { excluirInfluenciador, salvarInfluenciador } from '@/features/influenciadores/actions'
import { FormularioInfluenciador } from '@/features/influenciadores/components/formularios'
import { integracaoDoPrograma, regrasDoPrograma } from '@/features/influenciadores/queries'
import { exigirEquipe } from '@/lib/auth'
import { hojeISO } from '@/lib/datas'

export const metadata: Metadata = { title: 'Editar influenciador' }

export default async function PaginaEditarInfluenciador({ params }: PageProps<'/influenciadores/[id]/editar'>) {
  const { id } = await params
  const { supabase, perfil } = await exigirEquipe()
  const [{ data: influenciador }, integracao, regras, { count: vendas }] = await Promise.all([
    supabase.from('influenciadores').select('*').eq('id', id).maybeSingle(),
    integracaoDoPrograma(),
    regrasDoPrograma(),
    supabase.from('influenciador_vendas').select('id', { count: 'exact', head: true }).eq('influenciador_id', id),
  ])
  if (!influenciador) notFound()

  return (
    <>
      <PageHeader titulo={`Editar ${influenciador.nome}`} voltar={{ href: `/influenciadores/${id}`, rotulo: influenciador.nome }} />
      <FormularioInfluenciador
        acao={salvarInfluenciador.bind(null, id)}
        influenciador={influenciador}
        padroes={{ comissao: regras.comissao_padrao, desconto: regras.desconto_padrao, criaCupomSozinho: integracao.cupons }}
        hoje={hojeISO()}
      />
      {perfil.papel === 'admin' && (
        <div className="mt-6">
          <ZonaDeRisco
            titulo="Excluir influenciador"
            descricao={
              (vendas ?? 0) > 0
                ? 'Este influenciador já tem vendas registradas, então não pode ser excluído: encerre a parceria na ficha dele (o histórico fica guardado).'
                : 'Apaga o cadastro e o login do Portal. O cupom é desligado na Shopify (não é apagado de lá). Só é possível enquanto não há vendas nem repasses.'
            }
          >
            {(vendas ?? 0) === 0 && (
              <ActionButton
                acao={excluirInfluenciador.bind(null, id)}
                variante="perigo"
                tamanho="md"
                confirmar={`Excluir ${influenciador.nome}? O cadastro e o login do Portal são apagados.`}
              >
                <Trash2 aria-hidden /> Excluir
              </ActionButton>
            )}
          </ZonaDeRisco>
        </div>
      )}
    </>
  )
}
