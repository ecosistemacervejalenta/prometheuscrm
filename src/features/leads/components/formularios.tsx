'use client'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Field, FormActions, FormSection, Input, Select, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const ORIGENS = ['WhatsApp', 'Instagram', 'Site', 'Evento', 'Indicação', 'Outro']

export function FormularioPasta({
  acao,
  pasta,
  voltar,
}: {
  acao: AcaoFormulario
  pasta?: { nome: string | null; descricao: string | null } | null
  voltar: string
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Pasta" descricao="Agrupa listas do mesmo tipo (ex.: Central da Cerveja).">
          <Field label="Nome da pasta" name="nome" obrigatorio className="sm:col-span-6">
            <Input name="nome" defaultValue={pasta?.nome ?? ''} maxLength={80} autoFocus={!pasta} placeholder="Ex.: Central da Cerveja" />
          </Field>
          <Field label="Descrição" name="descricao" className="sm:col-span-6">
            <Textarea name="descricao" defaultValue={pasta?.descricao ?? ''} placeholder="De onde vêm essas listas, para que serão usadas..." />
          </Field>
        </FormSection>
        <FormActions>
          <ButtonLink href={voltar} variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>{pasta ? 'Salvar alterações' : 'Criar pasta'}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}

export function FormularioLista({
  acao,
  lista,
  pastas,
}: {
  acao: AcaoFormulario
  lista: { id: string; nome: string; origem: string | null; pasta_id: string }
  pastas: Array<{ id: string; nome: string }>
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Lista">
          <Field label="Nome da lista" name="nome" obrigatorio className="sm:col-span-4">
            <Input name="nome" defaultValue={lista.nome} maxLength={120} />
          </Field>
          <Field label="Origem" name="origem" className="sm:col-span-2">
            <Input name="origem" list="origens-lista" defaultValue={lista.origem ?? ''} maxLength={60} />
            <datalist id="origens-lista">
              {ORIGENS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Pasta" name="pasta_id" className="sm:col-span-6" dica="Mude para mover a lista de pasta.">
            <Select name="pasta_id" defaultValue={lista.pasta_id}>
              {pastas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>
        <FormActions>
          <ButtonLink href={`/leads/listas/${lista.id}`} variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>Salvar alterações</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}
