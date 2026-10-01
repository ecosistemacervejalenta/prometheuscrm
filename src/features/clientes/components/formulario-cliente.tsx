'use client'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { AddressFields } from '@/components/form/address-fields'
import { Checkbox, Field, FormActions, FormSection, Input, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatarWhatsapp } from '@/lib/format'
import type { Cliente } from '@/types'

export function FormularioCliente({
  acao,
  cliente,
  cancelarHref,
}: {
  acao: AcaoFormulario
  cliente?: Cliente | null
  cancelarHref: string
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Dados pessoais" descricao="Nome e documentos do cliente.">
          <Field label="Nome completo" name="nome" obrigatorio className="sm:col-span-6">
            <Input name="nome" defaultValue={cliente?.nome} autoComplete="name" autoFocus={!cliente} />
          </Field>
          <Field label="CPF" name="cpf" className="sm:col-span-3">
            <Input name="cpf" defaultValue={cliente?.cpf ?? ''} inputMode="numeric" placeholder="Somente números" />
          </Field>
          <Field label="Data de nascimento" name="data_nascimento" className="sm:col-span-3">
            <Input name="data_nascimento" type="date" defaultValue={cliente?.data_nascimento ?? ''} />
          </Field>
        </FormSection>

        <FormSection titulo="Contato" descricao="O WhatsApp identifica o cliente nos links de pré-venda.">
          <Field label="WhatsApp" name="whatsapp" className="sm:col-span-3" dica="Com DDD. Ex.: (11) 98765-4321">
            <Input
              name="whatsapp"
              type="tel"
              inputMode="tel"
              defaultValue={cliente?.whatsapp ? formatarWhatsapp(cliente.whatsapp) : ''}
              placeholder="(11) 98765-4321"
            />
          </Field>
          <Field label="E-mail" name="email" className="sm:col-span-3">
            <Input name="email" type="email" defaultValue={cliente?.email ?? ''} autoComplete="email" />
          </Field>
        </FormSection>

        <FormSection titulo="Endereço de entrega" descricao="Digite o CEP para preencher automaticamente.">
          <AddressFields inicial={cliente} />
        </FormSection>

        <FormSection titulo="Relacionamento">
          <div className="sm:col-span-6">
            <Checkbox
              name="vip"
              defaultChecked={cliente?.vip ?? false}
              label="Membro do Grupo VIP"
              descricao="Recebe as pré-vendas exclusivas do grupo."
            />
          </div>
          <Field label="Tags" name="tags" className="sm:col-span-6" dica="Separe por vírgula. Ex.: IPA, Stout, aniversariante">
            <Input name="tags" defaultValue={cliente?.tags?.join(', ') ?? ''} />
          </Field>
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" defaultValue={cliente?.observacoes ?? ''} />
          </Field>
        </FormSection>

        <FormActions>
          <ButtonLink href={cancelarHref} variante="fantasma">
            Cancelar
          </ButtonLink>
          <SubmitButton>{cliente ? 'Salvar alterações' : 'Cadastrar cliente'}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}
