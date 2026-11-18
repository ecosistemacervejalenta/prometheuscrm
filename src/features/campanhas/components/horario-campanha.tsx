'use client'

import { Clock } from 'lucide-react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'

import { alterarHorarioCampanha } from '../actions'

/** Troca o horário de envio enquanto a mensagem está em análise na Meta. */
export function HorarioCampanha({ campanhaId, horario }: { campanhaId: string; horario: string | null }) {
  return (
    <ActionForm action={alterarHorarioCampanha} className="space-y-3">
      <input type="hidden" name="campanha_id" value={campanhaId} />
      <Field
        label="Sair às"
        name="horario_envio"
        dica="Depois que a Meta aprovar. Deixe vazio para sair assim que ela aprovar, a qualquer hora."
      >
        <Input name="horario_envio" type="time" defaultValue={horario ?? ''} className="max-w-[10rem]" />
      </Field>
      <SubmitButton variante="secundario" tamanho="sm">
        <Clock /> Salvar horário
      </SubmitButton>
    </ActionForm>
  )
}
