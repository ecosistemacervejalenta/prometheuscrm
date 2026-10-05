'use client'

import { useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Checkbox, Field, Select } from '@/components/form/fields'

import { salvarConfigAtendimento } from '../actions'
import type { ConfigAtendimento } from '../queries'

export function FormularioConfigAtendimento({ config }: { config: ConfigAtendimento }) {
  const [automatico, setAutomatico] = useState(config.leadsAutomatico)

  return (
    <ActionForm action={salvarConfigAtendimento} className="space-y-4">
      <Checkbox
        name="whatsapp_assinatura"
        defaultChecked={config.assinatura}
        label="Assinar as mensagens com o nome do atendente"
        descricao="O cliente recebe “*Ana:* Temos sim!” — o nome vem do perfil em Configurações › Equipe."
      />
      <Checkbox
        name="whatsapp_leads_automatico"
        checked={automatico}
        onChange={(e) => setAutomatico(e.target.checked)}
        label="Salvar automaticamente no Banco de Leads quem chamar no WhatsApp"
        descricao="Nome e telefone vão para a lista “WhatsApp” da pasta escolhida. O botão “Salvar” na conversa continua disponível."
      />
      <Field label="Pasta do Banco de Leads" name="whatsapp_pasta_leads_id" className="max-w-sm">
        <Select name="whatsapp_pasta_leads_id" defaultValue={config.pastaLeadsId ?? ''} required={automatico}>
          <option value="">Escolha uma pasta</option>
          {config.pastas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton tamanho="sm" variante="secundario">
        Salvar preferências
      </SubmitButton>
    </ActionForm>
  )
}
