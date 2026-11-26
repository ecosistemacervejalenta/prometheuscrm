import { CircleCheck, CircleDashed, RefreshCw } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Codigo, Passos } from '@/features/configuracoes/components/blocos'
import { formatarHaQuanto } from '@/lib/format'
import { cn } from '@/lib/utils'

import { conferirPermissoes, sincronizarAgora } from '../actions'
import type { IntegracaoDoPrograma } from '../queries'

/** O que ainda falta na Shopify para o programa andar sozinho. Sem nada faltando, não aparece. */
export function AvisoDaShopify({ integracao, naTelaDeAjustes = false }: { integracao: IntegracaoDoPrograma; naTelaDeAjustes?: boolean }) {
  if (integracao.conectada && integracao.cupons && integracao.pedidos) return null

  const irParaAjustes = !naTelaDeAjustes && (
    <ButtonLink href="/influenciadores/ajustes" tamanho="sm" variante="secundario" className="mt-2">
      Ver o passo a passo
    </ButtonLink>
  )

  if (!integracao.conectada) {
    return (
      <Alert tom="alerta" titulo="A Shopify ainda não está conectada ao CRM" className="mb-5 lg:mb-6">
        Sem a conexão, o CRM não lê os pedidos feitos com cupom nem cria os cupons. Conecte em Configurações › Shopify e depois dê as
        permissões de cupons e de pedidos.
        <div>
          <ButtonLink href="/configuracoes/shopify" tamanho="sm" variante="secundario" className="mt-2">Conectar a Shopify</ButtonLink>
        </div>
      </Alert>
    )
  }
  if (!integracao.pedidos) {
    return (
      <Alert tom="alerta" titulo="Falta a permissão para ler os pedidos da Shopify" className="mb-5 lg:mb-6">
        Sem ela, as vendas com cupom não chegam ao CRM — nada aparece aqui nem no Portal do influenciador.
        {!integracao.cupons && ' Também falta a permissão de cupons (o CRM cria e pausa o cupom sozinho).'}
        <div>{irParaAjustes}</div>
      </Alert>
    )
  }
  return (
    <Alert tom="info" titulo="O CRM ainda não cria cupons na Shopify" className="mb-5 lg:mb-6">
      As vendas já são contadas. Enquanto faltar a permissão de cupons, crie e pause cada cupom em Descontos, no admin da Shopify.
      <div>{irParaAjustes}</div>
    </Alert>
  )
}

function Capacidade({ ok, titulo, descricao }: { ok: boolean; titulo: string; descricao: string }) {
  const Icone = ok ? CircleCheck : CircleDashed
  return (
    <li className="flex gap-3 rounded-xl bg-papel p-3.5">
      <Icone className={cn('mt-0.5 size-5 shrink-0', ok ? 'text-sucesso' : 'text-alerta')} aria-hidden />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{titulo}</p>
        <p className="text-[13px] text-suave">{descricao}</p>
      </div>
    </li>
  )
}

/** Situação da ligação com a loja (Ajustes): o que o app já pode fazer e quando leu os pedidos. */
export function SituacaoDaShopify({
  integracao,
  sincronizadoEm,
  erro,
}: {
  integracao: IntegracaoDoPrograma
  sincronizadoEm: string | null
  erro: string | null
}) {
  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2">
        <Capacidade
          ok={integracao.conectada}
          titulo={integracao.conectada ? `Loja conectada` : 'Loja não conectada'}
          descricao={integracao.conectada ? (integracao.loja_nome ?? integracao.loja ?? 'Shopify') : 'Conecte em Configurações › Shopify.'}
        />
        <Capacidade
          ok={integracao.pedidos}
          titulo="Ler os pedidos"
          descricao={integracao.pedidos ? 'Vendas com cupom entram sozinhas, a cada 15 minutos.' : 'Falta a permissão read_orders.'}
        />
        <Capacidade
          ok={integracao.cupons}
          titulo="Criar e pausar cupons"
          descricao={integracao.cupons ? 'O cupom nasce na Shopify junto com o cadastro.' : 'Falta a permissão write_discounts.'}
        />
        <Capacidade
          ok={integracao.produtos}
          titulo="Ler os produtos (simulador)"
          descricao={
            integracao.produtos
              ? 'O simulador do cadastro usa o catálogo pela API.'
              : 'Opcional: com read_products o catálogo do simulador não depende da vitrine, que a Shopify limita.'
          }
        />
      </ul>
      {erro && integracao.pedidos && (
        <Alert tom="erro" titulo="A última leitura dos pedidos falhou">
          {erro}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton acao={sincronizarAgora} variante="escuro">
          <RefreshCw aria-hidden /> Ler pedidos agora
        </ActionButton>
        <ActionButton acao={conferirPermissoes}>Conferir permissões</ActionButton>
        <p className="tipo-dado min-w-0 flex-1 basis-48 text-[12px] text-suave">
          {sincronizadoEm ? `Pedidos lidos ${formatarHaQuanto(sincronizadoEm)}` : 'Pedidos ainda não foram lidos'}
        </p>
      </div>
    </div>
  )
}

/** Passo a passo para dar ao app da loja as duas permissões do programa. */
export function GuiaDePermissoes() {
  return (
    <Passos
      passos={[
        {
          titulo: 'Abra o app do CRM no Dev Dashboard',
          conteudo: (
            <>
              No admin da Shopify: <b>Configurações › Apps e canais de vendas › Desenvolver apps</b> e abra o app “Prometheus CRM” (o mesmo que
              calcula o frete). Se a loja ainda não está conectada, siga antes o guia de Configurações › Shopify.
            </>
          ),
        },
        {
          titulo: 'Crie uma versão com as permissões novas',
          conteudo: (
            <>
              Em <b>Versions</b>, crie uma versão e, em <b>Scopes</b> (Admin API), deixe estas quatro:{' '}
              <Codigo>write_draft_orders</Codigo> <Codigo>read_orders</Codigo> <Codigo>write_discounts</Codigo> <Codigo>read_products</Codigo>. Clique em{' '}
              <b>Release</b>.
              <span className="mt-1 block text-[13px] text-suave">
                <Codigo>read_orders</Codigo> lê valor, situação e cupom dos pedidos (nenhum dado do cliente é copiado para o programa).{' '}
                <Codigo>write_discounts</Codigo> cria, pausa e reativa os cupons dos influenciadores. <Codigo>read_products</Codigo> traz o catálogo
                para o simulador do cadastro.
              </span>
            </>
          ),
        },
        {
          titulo: 'Aprove o novo acesso na loja',
          conteudo: (
            <>
              A Shopify pede para a loja aceitar as permissões novas do app: abra o app na loja (ou o aviso em <b>Apps</b>) e clique em{' '}
              <b>Atualizar</b>/<b>Install</b>.
            </>
          ),
        },
        {
          titulo: 'Volte aqui e clique em “Conferir permissões”',
          conteudo: <>O CRM pede um acesso novo à Shopify e mostra, acima, o que já está liberado. Depois, “Ler pedidos agora” traz os últimos 60 dias.</>,
        },
      ]}
    />
  )
}
