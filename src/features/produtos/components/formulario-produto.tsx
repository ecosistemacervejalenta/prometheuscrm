'use client'

import { ImageUp } from 'lucide-react'
import { useState } from 'react'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Checkbox, Field, FormActions, FormSection, Input, MoneyInput, Select, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { valorParaInput } from '@/lib/format'
import type { Produto } from '@/types'

export function FormularioProduto({
  acao,
  produto,
  fornecedores,
}: {
  acao: AcaoFormulario
  produto?: Produto | null
  fornecedores: Array<{ id: string; nome: string }>
}) {
  const [previa, setPrevia] = useState<string | null>(produto?.imagem_url ?? null)

  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <FormSection titulo="Cerveja" descricao="Como aparece no link da pré-venda.">
          <Field label="Nome" name="nome" obrigatorio className="sm:col-span-6">
            <Input name="nome" defaultValue={produto?.nome} autoFocus={!produto} placeholder="Ex.: Hop Hunters IPA" />
          </Field>
          <Field label="Estilo" name="estilo" className="sm:col-span-3">
            <Input name="estilo" defaultValue={produto?.estilo ?? ''} placeholder="American IPA" />
          </Field>
          <Field label="Cervejaria / marca" name="cervejaria" className="sm:col-span-3">
            <Input name="cervejaria" defaultValue={produto?.cervejaria ?? ''} />
          </Field>
          <Field label="Volume (ml)" name="volume_ml" className="sm:col-span-2">
            <Input name="volume_ml" type="number" min={1} defaultValue={produto?.volume_ml ?? ''} placeholder="473" />
          </Field>
          <Field label="Teor alcoólico (%)" name="teor_alcoolico" className="sm:col-span-2">
            <Input name="teor_alcoolico" inputMode="decimal" defaultValue={produto?.teor_alcoolico ?? ''} placeholder="6,5" />
          </Field>
          <Field label="Preço" name="preco" obrigatorio className="sm:col-span-2">
            <MoneyInput name="preco" defaultValue={valorParaInput(produto?.preco)} />
          </Field>
          <Field label="Descrição" name="descricao" className="sm:col-span-6">
            <Textarea name="descricao" defaultValue={produto?.descricao ?? ''} placeholder="Notas de sabor, harmonização..." />
          </Field>
        </FormSection>

        <FormSection titulo="Imagem" descricao="PNG, JPG ou WEBP até 4 MB.">
          <div className="flex items-center gap-4 sm:col-span-6">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-linha bg-papel">
              {previa ? (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou URL do Storage
                <img src={previa} alt="" className="size-full object-cover" />
              ) : (
                <ImageUp className="size-6 text-sutil" aria-hidden />
              )}
            </div>
            <Field label="Enviar imagem" name="imagem" className="flex-1">
              <input
                id="imagem"
                name="imagem"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) setPrevia(URL.createObjectURL(arquivo))
                }}
                className="block w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:text-sm file:font-semibold file:text-white"
              />
            </Field>
          </div>
          <input type="hidden" name="imagem_url" value={produto?.imagem_url ?? ''} />
        </FormSection>

        <FormSection titulo="Estoque e integrações">
          <Field label="SKU" name="sku" className="sm:col-span-2">
            <Input name="sku" defaultValue={produto?.sku ?? ''} />
          </Field>
          <Field label="Fornecedor" name="fornecedor_id" className="sm:col-span-4">
            <Select name="fornecedor_id" defaultValue={produto?.fornecedor_id ?? ''}>
              <option value="">Nenhum</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shopify · ID do produto" name="shopify_product_id" className="sm:col-span-3" dica="Preenchido pela integração.">
            <Input name="shopify_product_id" defaultValue={produto?.shopify_product_id ?? ''} />
          </Field>
          <Field label="Shopify · ID da variante" name="shopify_variant_id" className="sm:col-span-3">
            <Input name="shopify_variant_id" defaultValue={produto?.shopify_variant_id ?? ''} />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox name="ativo" defaultChecked={produto?.ativo ?? true} label="Produto ativo" descricao="Inativos não aparecem para novas pré-vendas." />
          </div>
        </FormSection>

        <FormActions>
          <ButtonLink href="/produtos" variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>{produto ? 'Salvar alterações' : 'Cadastrar produto'}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}
