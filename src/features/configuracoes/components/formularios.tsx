'use client'

import type { ReactNode } from 'react'

import { ActionForm, SubmitButton, useFormulario, type AcaoFormulario } from '@/components/form/action-form'
import { Checkbox, Field, Input, Select } from '@/components/form/fields'
import { Card, CardHeader } from '@/components/ui/card'
import { formatarWhatsapp } from '@/lib/format'
import { PLACEHOLDERS } from '@/lib/whatsapp'
import type { Configuracoes, Perfil } from '@/types'

import {
  cadastrarMembro,
  criarWebhook,
  salvarCaixaVip,
  salvarDadosLoja,
  salvarMensagens,
  salvarMeuPerfil,
  salvarPagamentoPix,
} from '../actions'
import { EditorMensagem } from './editor-mensagem'
import { PainelCredenciais } from './senha-temporaria'

/**
 * Cartão de ajuste: um assunto, os campos dele e o próprio botão de salvar no rodapé.
 * Salvar um cartão não mexe em nenhum outro.
 */
function CartaoAjuste({
  acao,
  titulo,
  descricao,
  nota,
  botao,
  children,
}: {
  acao: AcaoFormulario
  titulo: string
  descricao?: string
  /** Texto do rodapé: onde o ajuste aparece ou o que ele afeta. */
  nota?: ReactNode
  botao: string
  children: ReactNode
}) {
  return (
    <Card>
      <ActionForm action={acao} classeMensagem="mx-4 mt-4 lg:mx-5 lg:mt-5">
        <CardHeader titulo={titulo} descricao={descricao} />
        <div className="grid gap-4 px-4 pb-5 sm:grid-cols-6 lg:px-5">{children}</div>
        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-cartao border-t border-linha bg-papel/60 px-4 py-3 lg:px-5">
          <p className="min-w-0 flex-1 basis-56 text-[13px] text-suave">{nota}</p>
          <SubmitButton>{botao}</SubmitButton>
        </footer>
      </ActionForm>
    </Card>
  )
}

export function FormularioDadosLoja({ config }: { config: Configuracoes }) {
  return (
    <CartaoAjuste
      acao={salvarDadosLoja}
      titulo="Identidade da loja"
      nota="Aparece nas mensagens de WhatsApp e na página pública da pré-venda."
      botao="Salvar dados da loja"
    >
      <Field label="Nome da loja" name="nome_loja" obrigatorio className="sm:col-span-3">
        <Input name="nome_loja" defaultValue={config.nome_loja} />
      </Field>
      <Field label="WhatsApp da loja" name="whatsapp_loja" className="sm:col-span-3" dica="Botão “falar com a loja” no link público.">
        <Input name="whatsapp_loja" type="tel" defaultValue={config.whatsapp_loja ? formatarWhatsapp(config.whatsapp_loja) : ''} />
      </Field>
    </CartaoAjuste>
  )
}

export function FormularioPagamentoPix({ config }: { config: Configuracoes }) {
  return (
    <CartaoAjuste
      acao={salvarPagamentoPix}
      titulo="Chave PIX da loja"
      descricao="Mostrada no fim do link da pré-venda e enviada na mensagem de cobrança."
      nota="Com o Mercado Pago conectado, o link mostra o PIX automático e esta chave fica de reserva."
      botao="Salvar pagamento"
    >
      <Field label="Chave PIX" name="chave_pix" className="sm:col-span-3">
        <Input name="chave_pix" defaultValue={config.chave_pix ?? ''} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
      </Field>
      <Field label="Favorecido" name="nome_recebedor_pix" className="sm:col-span-3" dica="Nome que o cliente vê ao pagar.">
        <Input name="nome_recebedor_pix" defaultValue={config.nome_recebedor_pix ?? ''} />
      </Field>
      <Field
        label="WhatsApp para comprovantes"
        name="whatsapp_comprovante"
        className="sm:col-span-3"
        dica="O cliente envia o comprovante do PIX para este número."
      >
        <Input
          name="whatsapp_comprovante"
          type="tel"
          defaultValue={config.whatsapp_comprovante ? formatarWhatsapp(config.whatsapp_comprovante) : ''}
        />
      </Field>
    </CartaoAjuste>
  )
}

export function FormularioCaixaVip({ config }: { config: Configuracoes }) {
  return (
    <CartaoAjuste
      acao={salvarCaixaVip}
      titulo="Caixa sem pagamento"
      descricao="A caixa que não recebe nenhum pagamento é cancelada sozinha e as cervejas voltam ao estoque (inclusive na Olist)."
      nota="Você é avisado no sino quando alguma caixa vencer."
      botao="Salvar prazo"
    >
      <Field
        label="Cancelar depois de (dias)"
        name="caixa_prazo_pagamento_dias"
        className="sm:col-span-2"
        dica="De 0 a 60. Use 0 para nunca cancelar."
      >
        <Input name="caixa_prazo_pagamento_dias" type="number" min={0} max={60} inputMode="numeric" defaultValue={config.caixa_prazo_pagamento_dias} />
      </Field>
    </CartaoAjuste>
  )
}

export type ExemplosMensagens = { pre_venda: Record<string, string>; cobranca: Record<string, string> }

export function FormularioMensagens({ config, exemplos }: { config: Configuracoes; exemplos: ExemplosMensagens }) {
  return (
    <Card>
      <ActionForm action={salvarMensagens} classeMensagem="mx-4 mt-4 lg:mx-5 lg:mt-5">
        <EditorMensagem
          name="mensagem_pre_venda"
          titulo="Divulgação da pré-venda"
          descricao="Texto para divulgar cada pré-venda no WhatsApp, já com o link público."
          valorInicial={config.mensagem_pre_venda}
          variaveis={PLACEHOLDERS.pre_venda}
          exemplo={exemplos.pre_venda}
          linhas={7}
        />
        <EditorMensagem
          name="mensagem_cobranca"
          titulo="Cobrança"
          descricao="Enviada ao cliente com os itens do pedido, o total e a forma de pagamento."
          valorInicial={config.mensagem_cobranca}
          variaveis={PLACEHOLDERS.cobranca}
          exemplo={exemplos.cobranca}
          linhas={10}
        />
        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-cartao border-t border-linha bg-papel/60 px-4 py-3 lg:px-5">
          <p className="min-w-0 flex-1 basis-56 text-[13px] text-suave">
            Use <code className="tipo-dado text-[12px]">*negrito*</code> como no WhatsApp. Linhas que ficarem vazias somem da mensagem.
          </p>
          <SubmitButton>Salvar mensagens</SubmitButton>
        </footer>
      </ActionForm>
    </Card>
  )
}

const EVENTOS = [
  { valor: '*', rotulo: 'Todos os eventos' },
  { valor: 'pedido.criado', rotulo: 'Pedido criado' },
  { valor: 'pedido.pago', rotulo: 'Pedido pago' },
  { valor: 'pedido.itens_adicionados', rotulo: 'Caixa VIP recebeu cervejas de outra pré-venda' },
  { valor: 'pedido.atualizado', rotulo: 'Pedido atualizado (status/pagamento)' },
  { valor: 'pedido.cancelado', rotulo: 'Pedido cancelado' },
  { valor: 'cliente.criado', rotulo: 'Cliente criado' },
  { valor: 'cliente.atualizado', rotulo: 'Cliente atualizado' },
  { valor: 'pre_venda.criada', rotulo: 'Pré-venda criada' },
  { valor: 'pre_venda.atualizada', rotulo: 'Pré-venda atualizada' },
  { valor: 'whatsapp.mensagem_recebida', rotulo: 'WhatsApp: mensagem de cliente' },
  { valor: 'atendimento.transferido', rotulo: 'WhatsApp: atendimento transferido' },
]

export function FormularioWebhook() {
  return (
    <ActionForm action={criarWebhook} limparAoConcluir>
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Nome" name="nome" obrigatorio className="sm:col-span-2">
          <Input name="nome" placeholder="n8n · confirmações" />
        </Field>
        <Field label="URL" name="url" obrigatorio className="sm:col-span-4">
          <Input name="url" type="url" placeholder="https://seu-n8n.com/webhook/prometheus" />
        </Field>
        <Field label="Eventos" name="eventos" className="sm:col-span-6">
          <div className="grid gap-2 sm:grid-cols-3">
            {EVENTOS.map((e) => (
              <Checkbox key={e.valor} name="eventos" value={e.valor} label={e.rotulo} defaultChecked={e.valor === '*'} />
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <SubmitButton>Adicionar webhook</SubmitButton>
      </div>
    </ActionForm>
  )
}

function CredenciaisDoCadastro() {
  const { estado } = useFormulario()
  if (!estado.credenciais) return null
  return (
    <div className="mb-5">
      <PainelCredenciais credenciais={estado.credenciais} />
    </div>
  )
}

export function FormularioCadastroMembro() {
  return (
    <ActionForm action={cadastrarMembro} limparAoConcluir>
      <CredenciaisDoCadastro />
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Nome" name="nome" obrigatorio className="sm:col-span-3">
          <Input name="nome" />
        </Field>
        <Field label="E-mail" name="email" obrigatorio className="sm:col-span-3">
          <Input name="email" type="email" />
        </Field>
        <Field label="Cargo" name="cargo" className="sm:col-span-3">
          <Input name="cargo" placeholder="Atendimento, Logística..." />
        </Field>
        <Field label="Papel" name="papel" className="sm:col-span-3">
          <Select name="papel" defaultValue="equipe">
            <option value="equipe">Equipe</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <SubmitButton variante="escuro">Cadastrar e gerar senha</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function FormularioMeuPerfil({ perfil }: { perfil: Perfil }) {
  return (
    <ActionForm action={salvarMeuPerfil}>
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Nome" name="nome" obrigatorio className="sm:col-span-3">
          <Input name="nome" defaultValue={perfil.nome} />
        </Field>
        <Field label="Cargo" name="cargo" className="sm:col-span-3">
          <Input name="cargo" defaultValue={perfil.cargo ?? ''} />
        </Field>
        <Field
          label="WhatsApp pessoal"
          name="whatsapp"
          className="sm:col-span-6"
          dica="Recebe o aviso de cliente novo do rodízio (pelo n8n). Conversas deste número com a loja não entram no Atendimento."
        >
          <Input name="whatsapp" inputMode="tel" placeholder="(11) 98765-4321" defaultValue={perfil.whatsapp ? formatarWhatsapp(perfil.whatsapp) : ''} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <SubmitButton>Salvar meu perfil</SubmitButton>
      </div>
    </ActionForm>
  )
}

