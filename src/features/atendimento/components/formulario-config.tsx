'use client'

import { useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Checkbox, Field, Select, Textarea } from '@/components/form/fields'
import { cn } from '@/lib/utils'

import { salvarConfigAtendimento } from '../actions'
import type { ConfigAtendimento } from '../queries'

export function FormularioConfigAtendimento({ config }: { config: ConfigAtendimento }) {
  const [automatico, setAutomatico] = useState(config.leadsAutomatico)
  const [rodizio, setRodizio] = useState(config.rodizio)
  const participantes = new Set(config.rodizioParticipantes)

  return (
    <ActionForm action={salvarConfigAtendimento} className="space-y-4">
      <div className="space-y-3 rounded-xl border border-linha p-3">
        <Checkbox
          name="whatsapp_rodizio"
          checked={rodizio}
          onChange={(e) => setRodizio(e.target.checked)}
          label="Distribuir os atendimentos novos em rodízio"
          descricao="Cada cliente novo vai para o próximo da lista, um de cada, na ordem. Cliente que volta depois de “Resolvido” vai para quem atendeu da última vez (não conta como a vez dessa pessoa)."
        />
        {/* Sem "disabled": desligar o rodízio não apaga a lista (ela também define quem é avisado da fila). */}
        <fieldset className={cn('space-y-2 pl-[30px] transition-opacity', !rodizio && 'opacity-50')}>
          <legend className="tipo-rotulo mb-2 text-suave">Quem participa, na ordem da vez (desmarque para pausar: folga, almoço…)</legend>
          {config.membros.map((m) => (
            <Checkbox
              key={m.id}
              name="whatsapp_rodizio_participantes"
              value={m.id}
              defaultChecked={participantes.has(m.id)}
              label={m.nome}
            />
          ))}
          {config.rodizio && config.rodizioProximo && (
            <p className="text-[13px] text-suave">
              Próximo da vez: <strong className="text-ink">{config.rodizioProximo}</strong>
            </p>
          )}
        </fieldset>
      </div>
      <Checkbox
        name="whatsapp_assinatura"
        defaultChecked={config.assinatura}
        label="Assinar as mensagens com o nome do responsável pelo atendimento"
        descricao="O cliente recebe “*Ana Souza:* Temos sim!” — o nome do responsável (perfil em Configurações › Equipe) ou o escolhido em “Assinar como” na conversa."
      />
      <Field
        label="Nomes para “Assinar como”"
        name="whatsapp_nomes_assinatura"
        dica="Um nome por linha. Aparecem na conversa para responder com outro nome — útil quando mais de uma pessoa usa a mesma conta."
        className="max-w-sm"
      >
        <Textarea
          name="whatsapp_nomes_assinatura"
          rows={5}
          defaultValue={config.nomesAssinatura.join('\n')}
          placeholder={'Ana Souza\nBruno Lima'}
        />
      </Field>
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
