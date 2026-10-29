'use client'

import { Save } from 'lucide-react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'

import { salvarCredenciaisMarketplace } from '../actions'
import type { IdMarketplace, StatusMarketplace } from '../canais'

/** ID do app e chave secreta colados pelo admin. A chave vai para o Vault e nunca volta para a tela. */
export function FormularioCredenciais({
  canal,
  status,
  rotuloId,
  dicaId,
  rotuloSegredo,
  dicaSegredo,
}: {
  canal: IdMarketplace
  status: StatusMarketplace
  rotuloId: string
  dicaId: string
  rotuloSegredo: string
  dicaSegredo: string
}) {
  const salvo = status.configurado
  return (
    <ActionForm action={salvarCredenciaisMarketplace} className="space-y-4">
      <input type="hidden" name="canal" value={canal} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={rotuloId} name="client_id" obrigatorio dica={dicaId}>
          <Input name="client_id" inputMode="numeric" autoComplete="off" defaultValue={status.client_id ?? ''} />
        </Field>
        <Field
          label={rotuloSegredo}
          name="segredo"
          obrigatorio={!salvo}
          dica={salvo ? 'Já salva e criptografada. Deixe vazio para manter a atual.' : dicaSegredo}
        >
          <Input name="segredo" type="password" autoComplete="off" spellCheck={false} placeholder={salvo ? '•••••••• salva' : ''} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>
          <Save /> Salvar dados do app
        </SubmitButton>
        <p className="text-[13px] text-suave">A chave fica criptografada no banco — ninguém consegue vê-la de novo pela tela.</p>
      </div>
    </ActionForm>
  )
}
