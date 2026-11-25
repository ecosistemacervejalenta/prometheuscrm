'use client'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Textarea } from '@/components/form/fields'

import { registrarTratativa } from '../actions-avisos'

/** O que a pessoa fez para não perder a cerveja. Fica com o nome dela, o dia e a hora. */
export function FormularioTratativa({ alertaId, primeira }: { alertaId: string; primeira: boolean }) {
  return (
    <ActionForm action={registrarTratativa.bind(null, alertaId)} limparAoConcluir classeMensagem="mb-3" className="px-4 pb-4 lg:px-5">
      <Field
        label={primeira ? 'O que foi feito para não perder esta cerveja?' : 'Registrar outra tratativa'}
        name="texto"
        dica="Fica registrado com o seu nome, o dia e a hora, e o grupo recebe a confirmação."
      >
        <Textarea
          name="texto"
          rows={4}
          maxLength={2000}
          autoFocus={primeira}
          placeholder="Ex.: coloquei em promoção no Grupo VIP; separei 12 un. para o evento de sábado; combinei troca com o fornecedor…"
        />
      </Field>
      <div className="mt-3 flex justify-end">
        <SubmitButton>Registrar tratativa</SubmitButton>
      </div>
    </ActionForm>
  )
}
