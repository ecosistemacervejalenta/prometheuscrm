import type { ReactNode } from 'react'

import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Pilha, Recolhivel } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'

import { AVISOS_MARKETPLACE, MARKETPLACES, type IdMarketplace, type StatusMarketplace } from '../canais'
import { ConexaoMarketplace, CredenciaisMarketplace, DesconectarMarketplace, SeloMarketplace } from './cartao-marketplace'

/**
 * Página de um marketplace em Configurações: situação, conexão, credenciais, passo a passo
 * e — por último — a zona de risco. A mesma ordem para o Mercado Livre e a Shopee.
 */
export function SecaoMarketplace({
  canal,
  status,
  descricao,
  ehAdmin,
  retorno,
  guia,
  extra,
}: {
  canal: IdMarketplace
  status: StatusMarketplace
  /** O que o CRM lê deste canal. */
  descricao: string
  ehAdmin: boolean
  /** Resultado da autorização (?status=...), quando a pessoa volta do marketplace. */
  retorno?: string
  guia: ReactNode
  /** Quadro próprio do canal, logo abaixo da conexão (ex.: alertas do Mercado Livre no grupo). */
  extra?: ReactNode
}) {
  const { nome, slug } = MARKETPLACES[canal]
  const aviso = retorno ? AVISOS_MARKETPLACE[retorno] : undefined

  return (
    <>
      <CabecalhoSecao secao={slug === 'shopee' ? 'shopee' : 'mercado-livre'} selo={<SeloMarketplace status={status} />} somenteLeitura={!ehAdmin} />
      <Pilha estreita>
        {aviso && <Alert tom={aviso.tom}>{aviso.texto(nome)}</Alert>}

        <ConexaoMarketplace canal={canal} status={status} descricao={descricao} ehAdmin={ehAdmin} />

        {extra}

        {ehAdmin &&
          (status.configurado ? (
            <Recolhivel titulo="Trocar ID ou chave do app" descricao={`Só quando o ${nome} gerar credenciais novas.`}>
              <CredenciaisMarketplace canal={canal} status={status} />
            </Recolhivel>
          ) : (
            <Card>
              <CardHeader titulo="Credenciais" descricao="Cole aqui o ID e a chave do app criados no passo a passo abaixo." />
              <CardContent>
                <CredenciaisMarketplace canal={canal} status={status} />
              </CardContent>
            </Card>
          ))}

        {guia}

        <p className="text-[13px] text-suave">
          O Olist já traz quanto cada canal vendeu. Com esta conexão o CRM passa a ler também as tarifas, o frete e o valor que realmente
          cai na conta de cada venda. Somente leitura: nada é alterado nos anúncios.
        </p>

        {ehAdmin && status.conectado && <DesconectarMarketplace canal={canal} />}
      </Pilha>
    </>
  )
}
