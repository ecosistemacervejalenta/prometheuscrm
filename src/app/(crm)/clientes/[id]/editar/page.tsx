import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShieldOff, Trash2 } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { anonimizarCliente, excluirCliente, salvarCliente } from '@/features/clientes/actions'
import { FormularioCliente } from '@/features/clientes/components/formulario-cliente'
import { obterClienteParaEdicao } from '@/features/clientes/queries'
import { exigirEquipe } from '@/lib/auth'

export const metadata: Metadata = { title: 'Editar cliente' }

export default async function PaginaEditarCliente({ params }: PageProps<'/clientes/[id]/editar'>) {
  const { id } = await params
  const [cliente, { perfil }] = await Promise.all([obterClienteParaEdicao(id), exigirEquipe()])
  if (!cliente) notFound()
  const podeAnonimizar = perfil.papel === 'admin' && !cliente.anonimizado_em

  return (
    <>
      <PageHeader
        titulo={`Editar ${cliente.nome}`}
        voltar={{ href: `/clientes/${id}`, rotulo: 'Ficha do cliente' }}
        acoes={
          <>
            {podeAnonimizar && (
              <ActionButton
                acao={anonimizarCliente.bind(null, id)}
                variante="secundario"
                tamanho="md"
                titulo="Atende o pedido de exclusão de dados do cliente (LGPD)"
                confirmar={
                  `Anonimizar os dados de ${cliente.nome}?\n\n` +
                  'Use só quando o próprio cliente pedir a exclusão dos dados (LGPD).\n\n' +
                  'Sai: nome, WhatsApp, e-mail, CPF, endereço, conversas do Atendimento e o número no Banco de Leads e nas campanhas. ' +
                  'Os pedidos continuam no histórico (valores e cervejas), só com cidade/UF.\n\nNão dá para desfazer.'
                }
              >
                <ShieldOff /> Anonimizar (LGPD)
              </ActionButton>
            )}
            <ActionButton
              acao={excluirCliente.bind(null, id)}
              variante="perigo"
              tamanho="md"
              confirmar={`Excluir ${cliente.nome}? Esta ação não pode ser desfeita.`}
            >
              <Trash2 /> Excluir
            </ActionButton>
          </>
        }
      />
      <FormularioCliente acao={salvarCliente.bind(null, id)} cliente={cliente} cancelarHref={`/clientes/${id}`} />
    </>
  )
}
