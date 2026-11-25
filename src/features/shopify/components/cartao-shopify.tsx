import { ExternalLink, Save, Unplug } from 'lucide-react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonExternal } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Codigo, Dado, Dados, Passos, ZonaDeRisco } from '@/features/configuracoes/components/blocos'
import { formatarDataHora } from '@/lib/format'

import { desconectarShopify, salvarConexaoShopify } from '../actions'
import type { StatusShopify } from '../queries'

/** Situação do cálculo de frete em uma etiqueta (cartão da seção e visão geral). */
export function situacaoFreteShopify(status: StatusShopify): { tom: 'sucesso' | 'alerta' | 'perigo'; rotulo: string } {
  if (!status.conectado) return { tom: 'alerta', rotulo: 'Não conectado' }
  return status.ultimo_erro ? { tom: 'perigo', rotulo: 'Com erro' } : { tom: 'sucesso', rotulo: 'Conectado' }
}

export function SeloFreteShopify({ status }: { status: StatusShopify }) {
  const { tom, rotulo } = situacaoFreteShopify(status)
  return <Badge tom={tom} ponto>{rotulo}</Badge>
}

/** Loja que responde os fretes. Só aparece depois de conectada. */
export function ConexaoShopify({ status }: { status: StatusShopify }) {
  if (!status.conectado) return null
  return (
    <Card>
      <CardHeader
        titulo="Loja conectada"
        descricao="No link da pré-venda, CEP fora da lista VIP tem o frete calculado sozinho: a opção mais barata do Olist Envios para o peso da caixa."
        acoes={<SeloFreteShopify status={status} />}
      />
      <CardContent className="space-y-4">
        <Dados colunas={4}>
          <Dado rotulo="Loja" largo>
            {status.loja_nome ?? status.loja ?? '—'}
            {status.loja && <span className="tipo-dado block text-[12px] text-suave">{status.loja}.myshopify.com</span>}
          </Dado>
          <Dado rotulo="Conectada em">{formatarDataHora(status.conectado_em)}</Dado>
          <Dado rotulo="Último frete calculado">{status.cotacao_em ? formatarDataHora(status.cotacao_em) : 'nenhum ainda'}</Dado>
          <Dado rotulo="Pedidos com frete calculado">
            <span className="tipo-dado">{status.fretes_calculados}</span>
          </Dado>
        </Dados>
        {status.ultimo_erro && (
          <Alert tom="erro" titulo="A Shopify recusou o último acesso">
            {status.ultimo_erro} Enquanto isso, os pedidos com CEP fora da lista ficam como “frete a cotar” e a equipe informa o valor.
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/** Loja + Client ID + Client secret do app, colados por um administrador. O secret vai criptografado para o banco. */
export function CredenciaisShopify({ status }: { status: StatusShopify }) {
  return (
    <ActionForm action={salvarConexaoShopify} className="space-y-4">
      <Field label="Endereço da loja" name="loja" obrigatorio dica="O endereço .myshopify.com (aparece no admin da Shopify), não o domínio do site.">
        <Input name="loja" autoComplete="off" spellCheck={false} defaultValue={status.loja ? `${status.loja}.myshopify.com` : ''} placeholder="minhaloja.myshopify.com" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client ID" name="client_id" obrigatorio dica="Passo 5 do guia: Configurações (Settings) do app.">
          <Input name="client_id" autoComplete="off" spellCheck={false} defaultValue={status.client_id ?? ''} />
        </Field>
        <Field label="Client secret" name="client_secret" obrigatorio dica={status.conectado ? 'Cole de novo para trocar: o salvo não pode ser lido.' : 'Mesma tela do Client ID.'}>
          <Input name="client_secret" type="password" autoComplete="off" spellCheck={false} placeholder={status.conectado ? '•••••••• salvo' : ''} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variante={status.conectado ? 'escuro' : 'primario'}>
          <Save /> {status.conectado ? 'Salvar credenciais' : 'Conectar a Shopify'}
        </SubmitButton>
        <p className="min-w-0 flex-1 basis-56 text-[13px] text-suave">
          O CRM confere o app na Shopify na hora. O Client secret fica criptografado no banco — ninguém consegue vê-lo de novo.
        </p>
      </div>
    </ActionForm>
  )
}

/** Passo a passo para criar o app da loja e pegar as credenciais. Sem moldura: a página decide o cartão. */
export function GuiaFreteShopify() {
  return (
    <div className="space-y-5">
      <Passos
        passos={[
          {
            titulo: 'Abra o Dev Dashboard pelo admin da loja',
            conteudo: (
              <>
                No admin da Shopify, entre em <b>Configurações › Apps e canais de vendas › Desenvolver apps</b> e clique em{' '}
                <b>Criar apps no Dev Dashboard</b> (em inglês: <i>Build apps in Dev Dashboard</i>). Entre por aqui, e não por outro
                cadastro de parceiro: o app precisa nascer na mesma organização da loja, senão a Shopify recusa o acesso.
              </>
            ),
          },
          {
            titulo: 'Crie o app',
            conteudo: (
              <>
                Clique em <b>Create app</b>, escolha <b>Start from Dev Dashboard</b>, dê o nome “Prometheus CRM” e clique em <b>Create</b>.
              </>
            ),
          },
          {
            titulo: 'Crie a versão com a permissão de rascunhos de pedido',
            conteudo: (
              <>
                Na página <b>Versions</b> do app, deixe o <b>App URL</b> como está e, em <b>Scopes</b> (Admin API), adicione{' '}
                <Codigo>write_draft_orders</Codigo>. Clique em <b>Release</b>.
                <span className="mt-1 block text-[13px] text-suave">
                  É a permissão que a Shopify exige para calcular frete. O CRM usa só o cálculo: não cria rascunho, pedido nem cliente na
                  loja.
                </span>
              </>
            ),
          },
          {
            titulo: 'Instale o app na loja',
            conteudo: (
              <>
                Na página do app, clique em <b>Install app</b>, escolha a sua loja e confirme em <b>Install</b>.
              </>
            ),
          },
          {
            titulo: 'Copie o Client ID e o Client secret',
            conteudo: (
              <>
                Em <b>Settings</b> do app, copie o <b>Client ID</b> e o <b>Client secret</b>, cole em Credenciais (acima) e clique em
                Conectar. O CRM confere na hora e mostra o nome da loja.
              </>
            ),
          },
          {
            titulo: 'Teste um frete',
            conteudo: (
              <>
                Use o “Testar um frete” com um CEP de fora da sua área e a quantidade de cervejas. O valor em destaque é o que o cliente
                paga no link. Compare com o que a Olist cobra pela etiqueta.
              </>
            ),
          },
        ]}
      />
      <ButtonExternal href="https://dev.shopify.com/dashboard" tamanho="sm">
        <ExternalLink /> Abrir o Dev Dashboard da Shopify
      </ButtonExternal>
    </div>
  )
}

export function DesconectarShopify() {
  return (
    <ZonaDeRisco
      titulo="Desconectar o cálculo de frete"
      descricao="CEP fora da lista VIP volta a ser “frete a cotar”: a equipe informa o valor e avisa o cliente. Os webhooks de pedidos não mudam."
    >
      <ActionButton
        acao={desconectarShopify}
        variante="perigo"
        confirmar="Desconectar o cálculo de frete? CEP fora da lista VIP volta a ser “frete a cotar” pela equipe."
      >
        <Unplug /> Desconectar
      </ActionButton>
    </ZonaDeRisco>
  )
}
