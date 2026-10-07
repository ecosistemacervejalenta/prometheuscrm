'use client'

import { Send } from 'lucide-react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'

import { enviarTesteCampanha } from '../actions'

/** Envia a mensagem aprovada para um WhatsApp de teste (não conta na campanha). */
export function TesteCampanha({ campanhaId }: { campanhaId: string }) {
  return (
    <ActionForm action={enviarTesteCampanha} className="space-y-3">
      <input type="hidden" name="campanha_id" value={campanhaId} />
      <Field label="WhatsApp para o teste" name="numero" dica="Chega como o cliente vai receber, com o seu primeiro nome no {nome}.">
        <Input name="numero" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" />
      </Field>
      <SubmitButton variante="secundario" tamanho="sm">
        <Send /> Enviar teste
      </SubmitButton>
    </ActionForm>
  )
}
