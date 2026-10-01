'use client'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Checkbox, Field, FormActions, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { valorParaInput } from '@/lib/format'
import { CATEGORIAS_CONTA, FORMAS_PAGAMENTO } from '@/lib/rotulos'
import type { ContaFixa, ContaPagar } from '@/types'

type OpcaoFornecedor = { id: string; nome: string }

function CamposBase({
  fornecedores,
  inicial,
}: {
  fornecedores: OpcaoFornecedor[]
  inicial?: { descricao?: string; categoria?: string; fornecedor_id?: string | null; valor?: number }
}) {
  return (
    <>
      <Field label="Descrição" name="descricao" obrigatorio className="sm:col-span-6">
        <Input name="descricao" defaultValue={inicial?.descricao} placeholder="Ex.: Aluguel, Lote de cervejas, Frete" autoFocus={!inicial} />
      </Field>
      <Field label="Categoria" name="categoria" className="sm:col-span-3">
        <Input name="categoria" list="categorias-conta" defaultValue={inicial?.categoria ?? 'Outros'} />
        <datalist id="categorias-conta">
          {CATEGORIAS_CONTA.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Fornecedor" name="fornecedor_id" className="sm:col-span-3">
        <Select name="fornecedor_id" defaultValue={inicial?.fornecedor_id ?? ''}>
          <option value="">Nenhum</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Valor" name="valor" obrigatorio className="sm:col-span-3">
        <MoneyInput name="valor" defaultValue={valorParaInput(inicial?.valor)} />
      </Field>
    </>
  )
}

export function FormularioContaVariavel({
  acao,
  fornecedores,
  hoje,
}: {
  acao: AcaoFormulario
  fornecedores: OpcaoFornecedor[]
  hoje: string
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Conta variável" descricao="Lançamento avulso do mês. Pode ser parcelado.">
          <CamposBase fornecedores={fornecedores} />
          <Field label="Vencimento" name="vencimento" obrigatorio className="sm:col-span-3">
            <Input name="vencimento" type="date" defaultValue={hoje} />
          </Field>
          <Field label="Parcelas" name="parcelas" className="sm:col-span-2" dica="1 = à vista">
            <Input name="parcelas" type="number" min={1} max={36} defaultValue={1} />
          </Field>
          <Field label="Forma de pagamento" name="forma_pagamento" className="sm:col-span-4">
            <Select name="forma_pagamento" defaultValue="">
              <option value="">—</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-6">
            <Checkbox name="ja_paga" label="Já foi paga" descricao="Marca a primeira parcela como paga hoje." />
          </div>
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" />
          </Field>
        </FormSection>
        <FormActions>
          <ButtonLink href="/contas" variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>Lançar conta</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}

export function FormularioContaFixa({
  acao,
  fornecedores,
  conta,
  mesAtual,
}: {
  acao: AcaoFormulario
  fornecedores: OpcaoFornecedor[]
  conta?: ContaFixa | null
  mesAtual: string
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Conta fixa" descricao="Gerada automaticamente todo mês (aluguel, internet, contador...).">
          <CamposBase fornecedores={fornecedores} inicial={conta ?? undefined} />
          <Field label="Dia do vencimento" name="dia_vencimento" obrigatorio className="sm:col-span-3" dica="Em meses curtos, usa o último dia.">
            <Input name="dia_vencimento" type="number" min={1} max={31} defaultValue={conta?.dia_vencimento ?? 10} />
          </Field>
          <Field label="Começa em" name="inicio_em" obrigatorio className="sm:col-span-3">
            <Input name="inicio_em" type="month" defaultValue={conta?.inicio_em.slice(0, 7) ?? mesAtual} />
          </Field>
          <Field label="Termina em" name="fim_em" className="sm:col-span-3" dica="Opcional. Em branco = sem fim.">
            <Input name="fim_em" type="month" defaultValue={conta?.fim_em?.slice(0, 7) ?? ''} />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox name="ativa" defaultChecked={conta?.ativa ?? true} label="Ativa" descricao="Desmarque para pausar a geração mensal." />
          </div>
          {conta && (
            <div className="sm:col-span-6">
              <Checkbox
                name="atualizar_pendentes"
                defaultChecked
                label="Aplicar às contas pendentes deste mês em diante"
                descricao="Atualiza valor e descrição das contas já geradas que ainda não foram pagas."
              />
            </div>
          )}
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" defaultValue={conta?.observacoes ?? ''} />
          </Field>
        </FormSection>
        <FormActions>
          <ButtonLink href="/contas/fixas" variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>{conta ? 'Salvar alterações' : 'Cadastrar conta fixa'}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}

export function FormularioEdicaoConta({
  acao,
  fornecedores,
  conta,
}: {
  acao: AcaoFormulario
  fornecedores: OpcaoFornecedor[]
  conta: ContaPagar
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo={conta.tipo === 'fixa' ? 'Conta fixa deste mês' : 'Conta variável'}>
          <CamposBase fornecedores={fornecedores} inicial={conta} />
          <Field label="Vencimento" name="vencimento" obrigatorio className="sm:col-span-3">
            <Input name="vencimento" type="date" defaultValue={conta.vencimento} />
          </Field>
          <Field label="Situação" name="status" className="sm:col-span-2">
            <Select name="status" defaultValue={conta.status}>
              <option value="pendente">Pendente</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </Field>
          <Field label="Pago em" name="pago_em" className="sm:col-span-2">
            <Input name="pago_em" type="date" defaultValue={conta.pago_em ?? ''} />
          </Field>
          <Field label="Forma de pagamento" name="forma_pagamento" className="sm:col-span-2">
            <Select name="forma_pagamento" defaultValue={conta.forma_pagamento ?? ''}>
              <option value="">—</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" defaultValue={conta.observacoes ?? ''} />
          </Field>
        </FormSection>
        <FormActions>
          <ButtonLink href={`/contas?mes=${conta.competencia.slice(0, 7)}`} variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>Salvar</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}
