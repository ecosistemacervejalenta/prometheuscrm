'use client'

import { useState } from 'react'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Checkbox, Field, FormActions, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CampoCategoria } from '@/features/financeiro/components/campo-categoria'
import { CamposParcelamento } from '@/features/financeiro/components/campos-parcelamento'
import { valorParaInput } from '@/lib/format'
import { FORMAS_PAGAMENTO } from '@/lib/rotulos'
import type { ContaFixa, ContaPagar } from '@/types'

import { PROJETO_GERAL } from '../regras'

type OpcaoFornecedor = { id: string; nome: string; ativo: boolean }

function CamposBase({
  fornecedores,
  categorias,
  inicial,
  exemplo = 'Ex.: Boleto do fornecedor, Conta de luz',
}: {
  fornecedores: OpcaoFornecedor[]
  categorias: string[]
  inicial?: { descricao?: string; categoria?: string; fornecedor_id?: string | null }
  exemplo?: string
}) {
  // Fornecedores inativos só aparecem se já estiverem vinculados a esta conta.
  const opcoes = fornecedores.filter((f) => f.ativo || f.id === inicial?.fornecedor_id)
  return (
    <>
      <Field label="Descrição" name="descricao" obrigatorio className="sm:col-span-6">
        <Input
          name="descricao"
          defaultValue={inicial?.descricao}
          placeholder={exemplo}
          maxLength={200}
          autoFocus={!inicial}
        />
      </Field>
      <CampoCategoria categorias={categorias} inicial={inicial?.categoria} className="sm:col-span-3" />
      <Field label="Fornecedor" name="fornecedor_id" className="sm:col-span-3">
        <Select name="fornecedor_id" defaultValue={inicial?.fornecedor_id ?? ''}>
          <option value="">Nenhum</option>
          {opcoes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
              {f.ativo ? '' : ' (inativo)'}
            </option>
          ))}
        </Select>
      </Field>
    </>
  )
}

const NOVO_PROJETO = '__novo__'

/**
 * Campo "Projeto": projetos já usados + "+ Novo projeto…". No novo, o nome digitado
 * é que vai como `projeto` (o <select> deixa de enviar o valor).
 */
function CampoProjeto({ projetos, inicial, className }: { projetos: string[]; inicial?: string; className?: string }) {
  const opcoes = inicial && !projetos.includes(inicial) ? [...projetos, inicial] : projetos
  const [valor, setValor] = useState(inicial ?? PROJETO_GERAL)
  const novo = valor === NOVO_PROJETO

  return (
    <Field
      label="Projeto"
      name="projeto"
      obrigatorio
      className={className}
      dica={novo ? 'Fica salvo para as próximas contas.' : 'Onde esse custo é usado.'}
    >
      <Select name={novo ? undefined : 'projeto'} value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Projeto">
        {opcoes.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={NOVO_PROJETO}>+ Novo projeto…</option>
      </Select>
      {novo && (
        <Input name="projeto" aria-label="Nome do novo projeto" placeholder="Ex.: Lupp" maxLength={60} autoFocus className="mt-2" />
      )}
    </Field>
  )
}

function FormaPagamento({ inicial }: { inicial?: string | null }) {
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

export function FormularioContaVariavel({
  acao,
  fornecedores,
  categorias,
  hoje,
}: {
  acao: AcaoFormulario
  fornecedores: OpcaoFornecedor[]
  categorias: string[]
  hoje: string
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection
          titulo="Conta variável"
          descricao="Boletos de fornecedores e contas de consumo (água, luz, internet...), lançados mês a mês. Parcelada, vira uma conta por mês; com vários boletos, uma conta por boleto."
        >
          <CamposBase fornecedores={fornecedores} categorias={categorias} />
          <CamposParcelamento hoje={hoje} variosBoletos />
          <Field label="Forma de pagamento" name="forma_pagamento" className="sm:col-span-3">
            <FormaPagamento />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox
              name="ja_paga"
              label="Já foi paga"
              descricao="Marca a primeira parcela (ou o boleto de vencimento mais próximo) como paga hoje."
            />
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
  categorias,
  projetos,
  conta,
  mesAtual,
}: {
  acao: AcaoFormulario
  fornecedores: OpcaoFornecedor[]
  categorias: string[]
  projetos: string[]
  conta?: ContaFixa | null
  mesAtual: string
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Conta fixa" descricao="Assinaturas, software e mão de obra: o mesmo custo todo mês, gerado automaticamente.">
          <CamposBase
            fornecedores={fornecedores}
            categorias={categorias}
            inicial={conta ?? undefined}
            exemplo="Ex.: Shopify, Folha de pagamento"
          />
          <Field
            label="Finalidade"
            name="finalidade"
            className="sm:col-span-4"
            dica="Para que serve? Justifica o custo na lista de contas fixas."
          >
            <Input
              name="finalidade"
              defaultValue={conta?.finalidade ?? ''}
              placeholder="Ex.: Servidor do n8n (automações)"
              maxLength={300}
            />
          </Field>
          <CampoProjeto projetos={projetos} inicial={conta?.projeto} className="sm:col-span-2" />
          <Field label="Valor" name="valor" obrigatorio className="sm:col-span-3" dica="Muda todo mês? Use uma estimativa e ajuste na conta do mês.">
            <MoneyInput name="valor" defaultValue={valorParaInput(conta?.valor)} />
          </Field>
          <Field label="Dia do vencimento" name="dia_vencimento" obrigatorio className="sm:col-span-3" dica="Em meses curtos, usa o último dia.">
            <Input name="dia_vencimento" type="number" inputMode="numeric" min={1} max={31} defaultValue={conta?.dia_vencimento ?? 10} />
          </Field>
          <Field label="Começa em" name="inicio_em" obrigatorio className="sm:col-span-3">
            <Input name="inicio_em" type="month" defaultValue={conta?.inicio_em.slice(0, 7) ?? mesAtual} />
          </Field>
          <Field label="Termina em" name="fim_em" className="sm:col-span-3" dica="Opcional. Em branco = sem fim.">
            <Input name="fim_em" type="month" defaultValue={conta?.fim_em?.slice(0, 7) ?? ''} />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox
              name="ativa"
              defaultChecked={conta?.ativa ?? true}
              label="Ativa"
              descricao="Desmarque para pausar: as contas pendentes dos próximos meses são removidas."
            />
          </div>
          {conta && (
            <div className="sm:col-span-6">
              <Checkbox
                name="atualizar_pendentes"
                defaultChecked
                label="Aplicar às contas pendentes deste mês em diante"
                descricao="Atualiza descrição, categoria, fornecedor, valor e dia de vencimento das contas já geradas que ainda não foram pagas."
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
  categorias,
  conta,
}: {
  acao: AcaoFormulario
  fornecedores: OpcaoFornecedor[]
  categorias: string[]
  conta: ContaPagar
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo={conta.tipo === 'fixa' ? 'Conta fixa deste mês' : 'Conta variável'}>
          <CamposBase fornecedores={fornecedores} categorias={categorias} inicial={conta} />
          <Field label="Valor" name="valor" obrigatorio className="sm:col-span-3">
            <MoneyInput name="valor" defaultValue={valorParaInput(conta.valor)} />
          </Field>
          <Field
            label="Vencimento"
            name="vencimento"
            obrigatorio
            className="sm:col-span-3"
            dica={conta.tipo === 'variavel' ? 'Mudou de mês? A conta passa para o mês do novo vencimento.' : undefined}
          >
            <Input name="vencimento" type="date" defaultValue={conta.vencimento} />
          </Field>
          <Field label="Situação" name="status" className="sm:col-span-2">
            <Select name="status" defaultValue={conta.status}>
              <option value="pendente">Pendente</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </Field>
          <Field label="Pago em" name="pago_em" className="sm:col-span-2" dica="Vazio = hoje, se paga.">
            <Input name="pago_em" type="date" defaultValue={conta.pago_em ?? ''} />
          </Field>
          <Field label="Forma de pagamento" name="forma_pagamento" className="sm:col-span-2">
            <FormaPagamento inicial={conta.forma_pagamento} />
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
