'use client'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Checkbox, Field, FormActions, FormSection, Input, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatarCnpj, formatarWhatsapp } from '@/lib/format'
import type { Fornecedor, Vendedor } from '@/types'

export function FormularioFornecedor({ acao, fornecedor }: { acao: AcaoFormulario; fornecedor?: Fornecedor | null }) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Empresa" descricao="Cervejaria, distribuidora ou prestador de serviço.">
          <Field label="Nome (fantasia)" name="nome" obrigatorio className="sm:col-span-6">
            <Input name="nome" defaultValue={fornecedor?.nome} autoFocus={!fornecedor} />
          </Field>
          <Field label="Razão social" name="razao_social" className="sm:col-span-4">
            <Input name="razao_social" defaultValue={fornecedor?.razao_social ?? ''} />
          </Field>
          <Field label="CNPJ" name="cnpj" className="sm:col-span-2">
            <Input name="cnpj" inputMode="numeric" defaultValue={fornecedor?.cnpj ? formatarCnpj(fornecedor.cnpj) : ''} />
          </Field>
        </FormSection>

        <FormSection titulo="Contato">
          <Field label="Telefone" name="telefone" className="sm:col-span-3">
            <Input name="telefone" type="tel" defaultValue={fornecedor?.telefone ?? ''} />
          </Field>
          <Field label="E-mail" name="email" className="sm:col-span-3">
            <Input name="email" type="email" defaultValue={fornecedor?.email ?? ''} />
          </Field>
          <Field label="Site" name="site" className="sm:col-span-6">
            <Input name="site" defaultValue={fornecedor?.site ?? ''} placeholder="https://" />
          </Field>
          <Field label="Cidade" name="cidade" className="sm:col-span-4">
            <Input name="cidade" defaultValue={fornecedor?.cidade ?? ''} />
          </Field>
          <Field label="UF" name="uf" className="sm:col-span-2">
            <Input name="uf" maxLength={2} defaultValue={fornecedor?.uf ?? ''} className="uppercase" />
          </Field>
        </FormSection>

        <FormSection titulo="Outros">
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" defaultValue={fornecedor?.observacoes ?? ''} placeholder="Prazo de pagamento, pedido mínimo..." />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox name="ativo" defaultChecked={fornecedor?.ativo ?? true} label="Fornecedor ativo" />
          </div>
        </FormSection>

        <FormActions>
          <ButtonLink href="/fornecedores" variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>{fornecedor ? 'Salvar alterações' : 'Cadastrar empresa'}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}

export function FormularioVendedor({
  acao,
  vendedor,
  empresasSelecionadas = [],
  empresas,
}: {
  acao: AcaoFormulario
  vendedor?: Vendedor | null
  empresasSelecionadas?: string[]
  empresas: Array<{ id: string; nome: string; ativo: boolean }>
}) {
  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Vendedor" descricao="Quem atende a loja (representante comercial).">
          <Field label="Nome do vendedor" name="nome" obrigatorio className="sm:col-span-6">
            <Input name="nome" defaultValue={vendedor?.nome} autoFocus={!vendedor} />
          </Field>
          <Field label="WhatsApp" name="whatsapp" className="sm:col-span-3">
            <Input name="whatsapp" type="tel" defaultValue={vendedor?.whatsapp ? formatarWhatsapp(vendedor.whatsapp) : ''} placeholder="(11) 98765-4321" />
          </Field>
          <Field label="E-mail" name="email" className="sm:col-span-3">
            <Input name="email" type="email" defaultValue={vendedor?.email ?? ''} />
          </Field>
        </FormSection>

        <FormSection titulo="Empresas que representa" descricao="Marque uma ou várias. Pode cadastrar novas na hora.">
          <div className="grid gap-2 sm:col-span-6 sm:grid-cols-2">
            {empresas.length === 0 && <p className="text-sm text-suave">Nenhuma empresa cadastrada ainda.</p>}
            {empresas.map((e) => (
              <Checkbox
                key={e.id}
                name="fornecedor_ids"
                value={e.id}
                defaultChecked={empresasSelecionadas.includes(e.id)}
                label={e.nome}
                descricao={e.ativo ? undefined : 'Inativa'}
                className="border border-linha p-3 hover:bg-papel"
              />
            ))}
          </div>
          <Field
            label="Novas empresas"
            name="novas_empresas"
            className="sm:col-span-6"
            dica="Separe por vírgula. Serão cadastradas como fornecedores automaticamente."
          >
            <Input name="novas_empresas" placeholder="Ex.: Cervejaria Alfa, Distribuidora Beta" />
          </Field>
        </FormSection>

        <FormSection titulo="Outros">
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" defaultValue={vendedor?.observacoes ?? ''} placeholder="Dia de visita, condições..." />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox name="ativo" defaultChecked={vendedor?.ativo ?? true} label="Vendedor ativo" />
          </div>
        </FormSection>

        <FormActions>
          <ButtonLink href="/fornecedores/vendedores" variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>{vendedor ? 'Salvar alterações' : 'Cadastrar vendedor'}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}
