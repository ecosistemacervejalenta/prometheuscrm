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
        <Field label="SKU da cerveja na Olist" name="sku" rotuloOculto className="flex-1">
          <Input
            name="sku"
            maxLength={60}
            placeholder="SKU da cerveja na Olist"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={foco}
            className="tipo-dado"
          />
        </Field>
        <SubmitButton className="lg:mt-0.5">
          <Search /> Buscar na Olist
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
