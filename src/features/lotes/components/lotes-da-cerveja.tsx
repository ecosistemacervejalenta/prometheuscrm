'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { formatarData } from '@/lib/format'

import { adicionarLote, editarLote, excluirLote } from '../actions'
import type { LoteDaCerveja } from '../queries'
import { SeloValidade } from './selo-validade'

export function FormularioNovoLote({ cervejaId, foco = false }: { cervejaId: string; foco?: boolean }) {
  const avisar = useAvisos()
  return (
    <ActionForm
      action={adicionarLote.bind(null, cervejaId)}
      limparAoConcluir
      mostrarSucesso={false}
      aoConcluir={(estado) => estado.mensagem && avisar(estado.mensagem)}
      classeMensagem="mb-3"
      className="px-4 pb-4 lg:px-5"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-start">
        <Field label="Lote" name="lote" dica="O código impresso na lata ou garrafa.">
          <Input name="lote" maxLength={60} placeholder="Ex.: L2411A" autoComplete="off" spellCheck={false} autoFocus={foco} className="tipo-dado" />
        </Field>
        <Field label="Validade" name="validade">
          <Input name="validade" type="date" min="2000-01-01" max="2100-12-31" />
        </Field>
        <SubmitButton className="sm:mt-[26px]">
          <Plus /> Adicionar lote
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

export function LinhaLote({ lote }: { lote: LoteDaCerveja }) {
  const [editando, setEditando] = useState(false)

  if (editando) {
    return (
      <li className="px-4 py-3 lg:px-5">
        <ActionForm action={editarLote.bind(null, lote.id)} aoConcluir={() => setEditando(false)} mostrarSucesso={false} classeMensagem="mb-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-start">
            <Field label="Lote" name="lote">
              <Input name="lote" defaultValue={lote.lote} maxLength={60} autoComplete="off" spellCheck={false} autoFocus className="tipo-dado" />
            </Field>
            <Field label="Validade" name="validade">
              <Input name="validade" type="date" defaultValue={lote.validade} min="2000-01-01" max="2100-12-31" />
            </Field>
            <div className="flex gap-1.5 sm:mt-[26px]">
              <SubmitButton variante="escuro">Salvar</SubmitButton>
              <Button variante="fantasma" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </ActionForm>
      </li>
    )
  }

  return (
    <li className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-5">
      <div className="min-w-0 flex-1">
        <p className="tipo-dado truncate text-[15px] font-semibold">{lote.lote}</p>
        <p className="mt-0.5 text-[13px] text-suave">Validade {formatarData(lote.validade)}</p>
      </div>
      <SeloValidade validade={lote.validade} />
      <div className="flex shrink-0 gap-1.5">
        <Button tamanho="sm" variante="secundario" onClick={() => setEditando(true)} title="Editar" aria-label={`Editar o lote ${lote.lote}`}>
          <Pencil />
        </Button>
        <ActionButton acao={excluirLote.bind(null, lote.id)} titulo={`Excluir o lote ${lote.lote}`} confirmar={`Excluir o lote ${lote.lote}?`}>
          <Trash2 />
        </ActionButton>
      </div>
    </li>
  )
}
