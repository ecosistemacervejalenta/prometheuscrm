'use client'

import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { formatarData } from '@/lib/format'
import { cn } from '@/lib/utils'

import { adicionarLotes, editarLote, excluirLote } from '../actions'
import type { LoteDaCerveja } from '../queries'
import { MAX_LOTES_POR_VEZ } from '../schema'
import { SeloValidade } from './selo-validade'

/**
 * Cadastro de um ou vários lotes de uma vez: cada linha é um lote + validade, "Outro lote"
 * abre mais uma linha e tudo é salvo junto.
 */
export function FormularioNovosLotes({ cervejaId, foco = false }: { cervejaId: string; foco?: boolean }) {
  const avisar = useAvisos()
  const proxima = useRef(1)
  const [linhas, setLinhas] = useState([0])
  /** Linha recém-aberta por "Outro lote": o cursor já vai para ela. */
  const [nova, setNova] = useState<number | null>(null)
  const varias = linhas.length > 1

  function abrirLinha() {
    const id = proxima.current++
    setLinhas((atuais) => [...atuais, id])
    setNova(id)
  }

  return (
    <ActionForm
      action={adicionarLotes.bind(null, cervejaId)}
      limparAoConcluir
      mostrarSucesso={false}
      aoConcluir={(estado) => {
        // Volta para uma linha só, em branco.
        setLinhas([proxima.current++])
        setNova(null)
        if (estado.mensagem) avisar(estado.mensagem)
      }}
      classeMensagem="mb-3"
      className="px-4 pb-4 lg:px-5"
    >
      <div className="space-y-2">
        {linhas.map((id, i) => (
          <div
            key={id}
            className={cn(
              'grid items-start gap-2 sm:gap-3',
              varias ? 'grid-cols-[minmax(0,1fr)_138px_40px] sm:grid-cols-[minmax(0,1fr)_190px_40px]' : 'grid-cols-[minmax(0,1fr)_138px] sm:grid-cols-[minmax(0,1fr)_190px]',
            )}
          >
            <Field label={i === 0 ? 'Lote' : `Lote ${i + 1}`} name={`lotes.${i}.lote`} rotuloOculto={i > 0}>
              <Input
                name={`lotes.${i}.lote`}
                maxLength={60}
                placeholder="Ex.: L2411A"
                autoComplete="off"
                spellCheck={false}
                autoFocus={id === nova || (foco && i === 0 && nova === null)}
                className="tipo-dado"
              />
            </Field>
            <Field label={i === 0 ? 'Validade' : `Validade do lote ${i + 1}`} name={`lotes.${i}.validade`} rotuloOculto={i > 0}>
              <Input name={`lotes.${i}.validade`} type="date" min="2000-01-01" max="2100-12-31" />
            </Field>
            {varias && (
              <Button
                tamanho="icone"
                variante="fantasma"
                className={i === 0 ? 'mt-[28px] lg:mt-[30px]' : 'mt-0.5 lg:mt-1'}
                onClick={() => setLinhas((atuais) => atuais.filter((linha) => linha !== id))}
                title="Tirar esta linha"
                aria-label={`Tirar a linha ${i + 1}`}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-suave">O lote é o código impresso na lata ou garrafa. Tem mais de um lote desta cerveja? Abra outra linha.</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variante="secundario" onClick={abrirLinha} disabled={linhas.length >= MAX_LOTES_POR_VEZ}>
          <Plus /> Outro lote
        </Button>
        <SubmitButton>{varias ? `Salvar ${linhas.length} lotes` : 'Salvar lote'}</SubmitButton>
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
