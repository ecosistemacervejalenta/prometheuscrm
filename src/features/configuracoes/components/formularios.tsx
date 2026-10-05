'use client'

import { ActionForm, SubmitButton, useFormulario } from '@/components/form/action-form'
import { Checkbox, Field, FormActions, FormSection, Input, Select, Textarea } from '@/components/form/fields'
import { Card } from '@/components/ui/card'
import { formatarWhatsapp } from '@/lib/format'
import { PLACEHOLDERS } from '@/lib/whatsapp'
import type { Configuracoes, Perfil } from '@/types'

import { cadastrarMembro, criarWebhook, salvarConfiguracoes, salvarMeuPerfil } from '../actions'
import { PainelCredenciais } from './senha-temporaria'

function Placeholders({ lista }: { lista: readonly string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      Variáveis:
      {lista.map((p) => (
        <code key={p} className="tipo-dado rounded bg-papel px-1 text-[12px] text-ink">
          {p}
        </code>
      ))}
    </span>
  )
}

export function FormularioLoja({ config }: { config: Configuracoes }) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={salvarConfiguracoes}>
        <FormSection titulo="Loja" descricao="Usado nas mensagens e na página pública da pré-venda.">
          <Field label="Nome da loja" name="nome_loja" obrigatorio className="sm:col-span-3">
            <Input name="nome_loja" defaultValue={config.nome_loja} />
          </Field>
          <Field label="WhatsApp da loja" name="whatsapp_loja" className="sm:col-span-3" dica="Botão “falar com a loja” no link público.">
            <Input name="whatsapp_loja" type="tel" defaultValue={config.whatsapp_loja ? formatarWhatsapp(config.whatsapp_loja) : ''} />
          </Field>
        </FormSection>

        <FormSection titulo="Pagamento (PIX)" descricao="Vai automaticamente na mensagem de cobrança.">
          <Field label="Chave PIX" name="chave_pix" className="sm:col-span-3">
            <Input name="chave_pix" defaultValue={config.chave_pix ?? ''} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
          </Field>
          <Field label="Favorecido" name="nome_recebedor_pix" className="sm:col-span-3">
            <Input name="nome_recebedor_pix" defaultValue={config.nome_recebedor_pix ?? ''} />
          </Field>
        </FormSection>

        <FormSection titulo="Mensagens de WhatsApp" descricao="Use *negrito* e as variáveis entre chaves.">
          <Field label="Divulgação da pré-venda" name="mensagem_pre_venda" className="sm:col-span-6" dica={<Placeholders lista={PLACEHOLDERS.pre_venda} />}>
            <Textarea name="mensagem_pre_venda" rows={6} defaultValue={config.mensagem_pre_venda} className="tipo-dado text-[13px]" />
          </Field>
          <Field label="Cobrança" name="mensagem_cobranca" className="sm:col-span-6" dica={<Placeholders lista={PLACEHOLDERS.cobranca} />}>
            <Textarea name="mensagem_cobranca" rows={10} defaultValue={config.mensagem_cobranca} className="tipo-dado text-[13px]" />
          </Field>
        </FormSection>

        <FormActions>
          <SubmitButton>Salvar configurações</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}

const EVENTOS = [
  { valor: '*', rotulo: 'Todos os eventos' },
  { valor: 'pedido.criado', rotulo: 'Pedido criado' },
  { valor: 'pedido.pago', rotulo: 'Pedido pago' },
  { valor: 'pedido.atualizado', rotulo: 'Pedido atualizado (status/pagamento)' },
  { valor: 'pedido.cancelado', rotulo: 'Pedido cancelado' },
  { valor: 'cliente.criado', rotulo: 'Cliente criado' },
  { valor: 'cliente.atualizado', rotulo: 'Cliente atualizado' },
  { valor: 'pre_venda.criada', rotulo: 'Pré-venda criada' },
  { valor: 'pre_venda.atualizada', rotulo: 'Pré-venda atualizada' },
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
        <SubmitButton>Cadastrar e gerar senha</SubmitButton>
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
      </div>
      <div className="mt-4 flex justify-end">
        <SubmitButton variante="secundario">Salvar meu perfil</SubmitButton>
      </div>
    </ActionForm>
  )
}

