import type { Metadata } from 'next'

import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Pilha, Recolhivel } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import {
  AVISOS_OLIST,
  AvisoEstoqueOlist,
  ConexaoOlist,
  DesconectarOlist,
  EstoqueOlist,
  GuiaOlist,
  SeloOlist,
} from '@/features/olist/components/cartao-olist'
import { chaveWebhookEstoqueOlist } from '@/features/olist/estoque'
import { resumoEstoqueOlist, statusOlist } from '@/features/olist/queries'
import { exigirEquipe } from '@/lib/auth'
import { urlDoSite } from '@/lib/url'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Olist ERP' }

export default async function PaginaOlist({ searchParams }: PageProps<'/configuracoes/olist'>) {
  const { perfil } = await exigirEquipe()
  const ehAdmin = perfil.papel === 'admin'
  const aviso = AVISOS_OLIST[param((await searchParams).olist) ?? '']
  const [status, site, estoque] = await Promise.all([statusOlist(), urlDoSite(), resumoEstoqueOlist().catch(() => null)])
  const chaveEstoque = ehAdmin ? chaveWebhookEstoqueOlist() : null
  const webhookEstoque = chaveEstoque ? `${site}/api/olist/webhook?chave=${chaveEstoque}` : null

  return (
    <>
      <CabecalhoSecao secao="olist" selo={<SeloOlist status={status} />} somenteLeitura={!ehAdmin} />
      <Pilha estreita>
        {aviso && <Alert tom={aviso.tom}>{aviso.texto}</Alert>}

        <ConexaoOlist status={status} ehAdmin={ehAdmin} />

        {status.conectado && estoque && <EstoqueOlist status={status} estoque={estoque} ehAdmin={ehAdmin} />}
        {status.conectado && estoque && ehAdmin && <AvisoEstoqueOlist webhook={webhookEstoque} />}

        {status.conectado ? (
          ehAdmin && (
            <Recolhivel titulo="Passo a passo e URL de redirecionamento" descricao="Para conferir ou refazer o aplicativo no Olist.">
              <GuiaOlist status={status} site={site} />
            </Recolhivel>
          )
        ) : (
          <Card>
            <CardHeader titulo="Como conectar" descricao="Feito uma vez só por um administrador." />
            <CardContent>
              <GuiaOlist status={status} site={site} />
            </CardContent>
          </Card>
        )}

        {ehAdmin && (status.conectado || status.expirada) && <DesconectarOlist />}
      </Pilha>
    </>
  )
}
