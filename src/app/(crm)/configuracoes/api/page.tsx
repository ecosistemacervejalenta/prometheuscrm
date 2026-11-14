import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ListaMobile } from '@/components/ui/lista-mobile'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Codigo, Pilha, UrlCopiavel } from '@/features/configuracoes/components/blocos'
import { CabecalhoSecao } from '@/features/configuracoes/components/cabecalho'
import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'
import type { Tom } from '@/lib/rotulos'
import { urlDoSite } from '@/lib/url'

export const metadata: Metadata = { title: 'API' }

const ENDPOINTS = [
  { metodo: 'GET', caminho: '/api/v1/clientes?whatsapp=&email=&q=', descricao: 'Busca clientes' },
  { metodo: 'POST', caminho: '/api/v1/clientes', descricao: 'Cria ou atualiza cliente pelo WhatsApp' },
  { metodo: 'GET', caminho: '/api/v1/pedidos?status_pagamento=&canal=&pre_venda=&desde=', descricao: 'Lista pedidos com itens' },
  { metodo: 'GET', caminho: '/api/v1/pedidos/{id}', descricao: 'Pedido completo (cliente, itens, endereço)' },
  { metodo: 'PATCH', caminho: '/api/v1/pedidos/{id}', descricao: 'Atualiza status / pagamento (ex.: PIX confirmado)' },
  { metodo: 'POST', caminho: '/api/v1/pedidos/{id}/cobranca', descricao: 'Registra cobrança enviada por automação' },
  { metodo: 'GET', caminho: '/api/v1/pre-vendas?status=ativa', descricao: 'Pré-vendas com link público' },
  { metodo: 'GET', caminho: '/api/v1/produtos', descricao: 'Catálogo de cervejas' },
]

const tomDoMetodo = (metodo: string): Tom => (metodo === 'GET' ? 'shopify' : metodo === 'POST' ? 'volt' : 'app')

export default async function PaginaApi() {
  await exigirEquipe()
  const site = await urlDoSite()
  const chaveOk = Boolean(envServidor.apiKey)

  return (
    <>
      <CabecalhoSecao
        secao="api"
        selo={chaveOk ? <Badge tom="sucesso" ponto>Chave configurada</Badge> : <Badge tom="alerta" ponto>Falta a chave</Badge>}
      />
      <Pilha>
        <Card className="max-w-3xl">
          <CardHeader titulo="Acesso" descricao="Para o n8n, o App próprio e outras automações." />
          <CardContent className="space-y-3 text-sm">
            <UrlCopiavel rotulo="Endereço base" valor={`${site}/api/v1`} />
            <p>
              Toda chamada leva o header <Codigo>Authorization: Bearer INTEGRATIONS_API_KEY</Codigo>.
            </p>
            {!chaveOk && (
              <p className="text-alerta">
                O servidor ainda não encontrou <Codigo>INTEGRATIONS_API_KEY</Codigo>. Gere um valor com <Codigo>openssl rand -hex 32</Codigo>,
                cadastre na Vercel e faça o Redeploy.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader titulo="Rotas" descricao="Documentação completa no README do projeto." />
          <ListaMobile>
            {ENDPOINTS.map((e) => (
              <li key={e.metodo + e.caminho} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tom={tomDoMetodo(e.metodo)}>{e.metodo}</Badge>
                  <span className="text-[13px] text-suave">{e.descricao}</span>
                </div>
                <p className="tipo-dado mt-1 text-[12px] break-all">{e.caminho}</p>
              </li>
            ))}
          </ListaMobile>
          <Table somenteDesktop>
            <THead>
              <TR>
                <TH>Método</TH>
                <TH>Rota</TH>
                <TH>O que faz</TH>
              </TR>
            </THead>
            <TBody>
              {ENDPOINTS.map((e) => (
                <TR key={e.metodo + e.caminho}>
                  <TD><Badge tom={tomDoMetodo(e.metodo)}>{e.metodo}</Badge></TD>
                  <TD className="tipo-dado max-w-[340px] text-[13px] break-all">{e.caminho}</TD>
                  <TD className="text-[13px] text-suave">{e.descricao}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </Pilha>
    </>
  )
}
