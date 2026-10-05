'use client'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Checkbox, Field, FormActions, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CampoCategoria } from '@/features/financeiro/components/campo-categoria'
import { CamposParcelamento } from '@/features/financeiro/components/campos-parcelamento'
import { valorParaInput } from '@/lib/format'
import { FORMAS_PAGAMENTO } from '@/lib/rotulos'
import type { ContaReceber } from '@/types'

function CamposBase({
  categorias,
  pagadores,
  inicial,
}: {
  categorias: string[]
  pagadores: string[]
  inicial?: { descricao?: string; categoria?: string; pagador?: string | null }
}) {
  return (
    <>
      <Field label="Descrição" name="descricao" obrigatorio className="sm:col-span-6">
        <Input
          name="descricao"
          defaultValue={inicial?.descricao}
          placeholder="Ex.: Barril para o Bar do Zé, Repasse da maquininha"
          maxLength={200}
          autoFocus={!inicial}
        />
      </Field>
      <CampoCategoria categorias={categorias} inicial={inicial?.categoria} className="sm:col-span-3" />
      <Field label="Recebido de" name="pagador" className="sm:col-span-3" dica="Cliente, empresa ou operadora.">
        <Input name="pagador" list="pagadores" defaultValue={inicial?.pagador ?? ''} maxLength={120} autoComplete="off" />
        <datalist id="pagadores">
          {pagadores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
    </>
  )
}

function FormaRecebimento({ inicial }: { inicial?: string | null }) {
  return (
    <Select name="forma_pagamento" defaultValue={inicial ?? ''}>
      <option value="">—</option>
      {FORMAS_PAGAMENTO.map((f) => (
        <option key={f}>{f}</option>
      ))}
      {inicial && !FORMAS_PAGAMENTO.includes(inicial) && <option>{inicial}</option>}
    </Select>
  )
}

export function FormularioContaReceber({
  acao,
  categorias,
  pagadores,
  hoje,
}: {
  acao: AcaoFormulario
  categorias: string[]
  pagadores: string[]
  hoje: string
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Conta a receber" descricao="Valores fora dos pedidos. Parcelada, vira uma conta por mês.">
          <CamposBase categorias={categorias} pagadores={pagadores} />
          <CamposParcelamento hoje={hoje} />
          <Field label="Forma de recebimento" name="forma_pagamento" className="sm:col-span-3">
            <FormaRecebimento />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox name="ja_recebida" label="Já foi recebida" descricao="Marca a primeira parcela como recebida hoje." />
          </div>
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" />
          </Field>
        </FormSection>
        <FormActions>
          <ButtonLink href="/receber" variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>Lançar conta</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}

export function FormularioEdicaoContaReceber({
  acao,
  categorias,
  pagadores,
  conta,
}: {
  acao: AcaoFormulario
  categorias: string[]
  pagadores: string[]
  conta: ContaReceber
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Conta a receber">
          <CamposBase categorias={categorias} pagadores={pagadores} inicial={conta} />
          <Field label="Valor" name="valor" obrigatorio className="sm:col-span-3">
            <MoneyInput name="valor" defaultValue={valorParaInput(conta.valor)} />
          </Field>
          <Field
            label="Vencimento"
            name="vencimento"
            obrigatorio
            className="sm:col-span-3"
            dica="Mudou de mês? A conta passa para o mês do novo vencimento."
          >
            <Input name="vencimento" type="date" defaultValue={conta.vencimento} />
          </Field>
          <Field label="Situação" name="status" className="sm:col-span-2">
            <Select name="status" defaultValue={conta.status}>
              <option value="pendente">Pendente</option>
              <option value="recebida">Recebida</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </Field>
          <Field label="Recebido em" name="recebido_em" className="sm:col-span-2" dica="Vazio = hoje, se recebida.">
            <Input name="recebido_em" type="date" defaultValue={conta.recebido_em ?? ''} />
          </Field>
          <Field label="Forma de recebimento" name="forma_pagamento" className="sm:col-span-2">
            <FormaRecebimento inicial={conta.forma_pagamento} />
          </Field>
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" defaultValue={conta.observacoes ?? ''} />
          </Field>
        </FormSection>
        <FormActions>
          <ButtonLink href={`/receber?mes=${conta.competencia.slice(0, 7)}`} variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>Salvar</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}
