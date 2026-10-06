'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Button } from '@/components/ui/button'

import { cadastrarEtiqueta, editarEtiqueta, excluirEtiqueta } from '../actions'
import type { EtiquetaComUso } from '../queries'
import type { CorEtiqueta } from '../schema'
import { EtiquetaChip, SeletorCor } from './etiqueta'

export function FormularioNovaEtiqueta({ sugerida }: { sugerida: CorEtiqueta }) {
  return (
    <ActionForm action={cadastrarEtiqueta} limparAoConcluir mostrarSucesso={false} className="space-y-3 px-4 pb-4 lg:px-5">
      <div className="flex items-start gap-2">
        <Field label="Nova etiqueta" name="nome" className="flex-1">
          <Input name="nome" maxLength={40} placeholder="Ex.: Produto quebrado, Aguardando entrega" autoComplete="off" />
        </Field>
        <SubmitButton variante="secundario" className="mt-[26px]">
          <Plus /> Adicionar
        </SubmitButton>
      </div>
      <SeletorCor padrao={sugerida} />
    </ActionForm>
  )
}

function textoUso({ abertos, total }: EtiquetaComUso) {
  if (total === 0) return 'Ainda não usada'
  const emAberto = abertos ? `${abertos} em aberto · ` : ''
  return `${emAberto}${total} atendimento${total === 1 ? '' : 's'} no total`
}

export function LinhaEtiqueta({ etiqueta }: { etiqueta: EtiquetaComUso }) {
  const [editando, setEditando] = useState(false)
  const { id, nome, total } = etiqueta

  if (editando) {
    return (
      <li className="px-4 py-3 lg:px-5">
        <ActionForm action={editarEtiqueta.bind(null, id)} aoConcluir={() => setEditando(false)} mostrarSucesso={false} className="space-y-3">
          <div className="flex items-start gap-2">
            <Field label={`Editar “${nome}”`} name="nome" className="flex-1" dica="Muda em todos os atendimentos que usam esta etiqueta.">
              <Input name="nome" defaultValue={nome} maxLength={40} autoFocus autoComplete="off" />
            </Field>
            <div className="mt-[26px] flex gap-1.5">
              <SubmitButton tamanho="sm">Salvar</SubmitButton>
              <Button tamanho="sm" variante="fantasma" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
          <SeletorCor padrao={etiqueta.cor} />
        </ActionForm>
      </li>
    )
  }

  return (
    <li className="flex min-h-[56px] items-center gap-3 px-4 py-2 lg:px-5">
      <div className="min-w-0 flex-1">
        <EtiquetaChip etiqueta={etiqueta} tamanho="md" />
        <p className="mt-1 text-[12px] text-suave">{textoUso(etiqueta)}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button tamanho="sm" variante="secundario" onClick={() => setEditando(true)} title="Editar" aria-label={`Editar ${nome}`}>
          <Pencil />
        </Button>
        <ActionButton
          acao={excluirEtiqueta.bind(null, id)}
          titulo={`Excluir ${nome}`}
          confirmar={
            total > 0
              ? `Excluir a etiqueta “${nome}”? Ela sai dos ${total} atendimento(s) em que foi usada.`
              : `Excluir a etiqueta “${nome}”?`
          }
        >
          <Trash2 />
        </ActionButton>
      </div>
    </li>
  )
}
