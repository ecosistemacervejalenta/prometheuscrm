'use client'

import { Search } from 'lucide-react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'

import { cadastrarCervejaPorSku } from '../actions'

/** Digita o SKU → o CRM consulta a Olist, cadastra a cerveja e abre a tela dos lotes dela. */
export function CadastroPorSku({ foco = false }: { foco?: boolean }) {
  return (
    <ActionForm action={cadastrarCervejaPorSku} classeMensagem="mb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Field label="SKU da cerveja na Olist" name="sku" className="flex-1" dica="É o código (SKU) do produto na Olist, igual ao de lá.">
          <Input
            name="sku"
            maxLength={60}
            placeholder="Digite o SKU"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={foco}
            className="tipo-dado"
          />
        </Field>
        <SubmitButton className="sm:mt-[26px]">
          <Search /> Buscar na Olist
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
