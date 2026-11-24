'use client'

import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { formatarData, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import { adicionarLotes, editarLote, excluirLote } from '../actions'
import type { LoteDaCerveja } from '../queries'
import { MAX_LOTES_POR_VEZ } from '../schema'
import { SeloValidade } from './selo-validade'

/**
 * Cadastro de um ou vários lotes de uma vez: cada linha é um lote + quantidade + validade,
 * "Outro lote" abre mais uma linha e tudo é salvo junto.
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
      <div className="space-y-3 sm:space-y-2">
        {linhas.map((id, i) => (
          // No celular o lote ocupa a linha inteira e quantidade + validade ficam embaixo.
          <div
            key={id}
            className={cn(
              'grid items-start gap-2 sm:gap-3',
              i > 0 && 'border-t border-linha pt-3 sm:border-0 sm:pt-0',
              varias
                ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_40px] sm:grid-cols-[minmax(0,1fr)_120px_180px_40px]'
                : 'grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:grid-cols-[minmax(0,1fr)_120px_180px]',
            )}
          >
            <Field label={i === 0 ? 'Lote' : `Lote ${i + 1}`} name={`lotes.${i}.lote`} rotuloOculto={i > 0} className="col-span-full sm:col-span-1">
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
            <Field label={i === 0 ? 'Quantidade' : `Quantidade do lote ${i + 1}`} name={`lotes.${i}.quantidade`} rotuloOculto={i > 0}>
              <Input name={`lotes.${i}.quantidade`} inputMode="numeric" maxLength={9} placeholder="Unidades" autoComplete="off" className="tipo-dado" />
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
      <p className="mt-2 text-[13px] text-suave">
        O lote é o código impresso na lata ou garrafa; a quantidade é quantas unidades desse lote você tem. Tem mais de um lote desta cerveja? Abra outra linha.
      </p>
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
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_120px_180px_auto] sm:gap-3">
            <Field label="Lote" name="lote" className="col-span-full sm:col-span-1">
              <Input name="lote" defaultValue={lote.lote} maxLength={60} autoComplete="off" spellCheck={false} autoFocus className="tipo-dado" />
            </Field>
            <Field label="Quantidade" name="quantidade">
              <Input name="quantidade" defaultValue={lote.quantidade ?? ''} inputMode="numeric" maxLength={9} placeholder="Unidades" autoComplete="off" className="tipo-dado" />
            </Field>
            <Field label="Validade" name="validade">
              <Input name="validade" type="date" defaultValue={lote.validade} min="2000-01-01" max="2100-12-31" />
            </Field>
            <div className="col-span-full flex gap-1.5 sm:col-span-1 sm:mt-[26px]">
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
      {/* Larguras fixas a partir do tablet: quantidade e selo ficam alinhados em coluna entre as linhas. */}
      <p className="tipo-dado shrink-0 sm:w-28 sm:text-right">
        {lote.quantidade === null ? <span className="text-[13px] text-sutil">sem quantidade</span> : `${formatarNumero(lote.quantidade)} un.`}
      </p>
      <span className="flex shrink-0 sm:w-44">
        <SeloValidade validade={lote.validade} />
      </span>
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
