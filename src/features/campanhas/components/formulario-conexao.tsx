'use client'

import { PlugZap } from 'lucide-react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'

import { salvarConexaoMeta } from '../actions'
import type { ConexaoMeta } from '../meta'

/** Token, IDs e chave secreta colados pelo admin. Os segredos vão para o Vault e nunca voltam para a tela. */
export function FormularioConexao({ conexao }: { conexao: ConexaoMeta }) {
  const salvo = conexao.configurado
  return (
    <ActionForm action={salvarConexaoMeta} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ID do app" name="app_id" obrigatorio dica="Configurações do app › Básico">
          <Input name="app_id" inputMode="numeric" autoComplete="off" defaultValue={conexao.app_id ?? ''} placeholder="Ex.: 1234567890123456" />
        </Field>
        <Field label="ID do número" name="phone_number_id" obrigatorio dica="WhatsApp › Configuração da API">
          <Input name="phone_number_id" inputMode="numeric" autoComplete="off" defaultValue={conexao.phone_number_id ?? ''} />
        </Field>
        <Field label="ID da conta do WhatsApp" name="waba_id" obrigatorio dica="WhatsApp › Configuração da API">
          <Input name="waba_id" inputMode="numeric" autoComplete="off" defaultValue={conexao.waba_id ?? ''} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <Field
          label="Token permanente"
          name="token"
          obrigatorio={!salvo}
          dica={salvo ? 'Já salvo e criptografado. Deixe vazio para manter o atual.' : 'Gerado no usuário do sistema (passo 5).'}
        >
          <Input name="token" type="password" autoComplete="off" spellCheck={false} placeholder={salvo ? '•••••••• salvo' : 'EAAG…'} />
        </Field>
        <Field
          label="Chave secreta do app"
          name="app_secret"
          obrigatorio={!conexao.tem_app_secret}
          dica={conexao.tem_app_secret ? 'Já salva. Deixe vazio para manter a atual.' : 'Configurações do app › Básico › Chave secreta do app.'}
        >
          <Input
            name="app_secret"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={conexao.tem_app_secret ? '•••••••• salva' : ''}
          />
        </Field>
        <Field label="PIN do número" name="pin" dica="6 dígitos. Registra o número na API — só na 1ª vez.">
          <Input name="pin" inputMode="numeric" autoComplete="off" maxLength={6} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>
          <PlugZap /> Salvar e testar conexão
        </SubmitButton>
        <p className="text-[13px] text-suave">O CRM confere tudo na Meta e já liga o webhook do app à sua conta.</p>
      </div>
    </ActionForm>
  )
}
