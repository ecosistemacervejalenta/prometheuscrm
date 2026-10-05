'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Button } from '@/components/ui/button'
import type { NaturezaFinanceira } from '@/types'

import { criarCategoria, excluirCategoria, renomearCategoria } from '../actions'

export function FormularioNovaCategoria({ natureza }: { natureza: NaturezaFinanceira }) {
  return (
    <ActionForm action={criarCategoria} limparAoConcluir className="px-4 pb-4 lg:px-5">
      <input type="hidden" name="natureza" value={natureza} />
      <div className="flex items-start gap-2">
        <Field label="Nova categoria" name="nome" className="flex-1">
          <Input name="nome" maxLength={60} placeholder="Ex.: Frete, Embalagens" autoComplete="off" />
        </Field>
        <SubmitButton variante="secundario" className="mt-[26px]">
          <Plus /> Adicionar
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

export function LinhaCategoria({ id, nome }: { id: string; nome: string }) {
  const [editando, setEditando] = useState(false)
  const protegida = nome.toLowerCase() === 'outros'

  if (editando) {
    return (
      <li className="px-4 py-3 lg:px-5">
        <ActionForm action={renomearCategoria.bind(null, id)} aoConcluir={() => setEditando(false)} mostrarSucesso={false}>
          <div className="flex items-start gap-2">
            <Field label={`Renomear “${nome}”`} name="nome" className="flex-1" dica="As contas desta categoria acompanham o novo nome.">
              <Input name="nome" defaultValue={nome} maxLength={60} autoFocus autoComplete="off" />
            </Field>
            <div className="mt-[26px] flex gap-1.5">
              <SubmitButton tamanho="sm">Salvar</SubmitButton>
              <Button tamanho="sm" variante="fantasma" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </ActionForm>
      </li>
    )
  }

  return (
    <li className="flex min-h-[52px] items-center gap-3 px-4 py-2 lg:px-5">
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{nome}</span>
      {protegida ? (
        <span className="text-[12px] text-suave">padrão</span>
      ) : (
        <div className="flex gap-1.5">
          <Button tamanho="sm" variante="secundario" onClick={() => setEditando(true)} title="Renomear" aria-label={`Renomear ${nome}`}>
            <Pencil />
          </Button>
          <ActionButton
            acao={excluirCategoria.bind(null, id)}
            titulo={`Excluir ${nome}`}
            confirmar={`Excluir a categoria “${nome}”? As contas dela passam para “Outros”.`}
          >
            <Trash2 />
          </ActionButton>
        </div>
      )}
    </li>
  )
}
