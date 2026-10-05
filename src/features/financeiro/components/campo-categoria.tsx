'use client'

import { useState } from 'react'

import { Field, Input, Select } from '@/components/form/fields'

import { NOVA_CATEGORIA } from '../regras'

/**
 * Campo "Categoria": lista das categorias cadastradas + "+ Nova categoria…", que
 * abre um campo para digitar o nome. A categoria nova é cadastrada ao salvar.
 */
export function CampoCategoria({
  categorias,
  inicial,
  className,
}: {
  categorias: string[]
  inicial?: string | null
  className?: string
}) {
  const opcoes = inicial && !categorias.includes(inicial) ? [...categorias, inicial] : categorias
  const [valor, setValor] = useState(inicial ?? '')
  const nova = valor === NOVA_CATEGORIA

  return (
    <Field
      label="Categoria"
      name="categoria"
      obrigatorio
      className={className}
      dica={nova ? 'Será cadastrada e aparecerá na lista das próximas contas.' : undefined}
    >
      <Select name="categoria" value={valor} onChange={(e) => setValor(e.target.value)}>
        <option value="" disabled>
          Selecione…
        </option>
        {opcoes.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={NOVA_CATEGORIA}>+ Nova categoria…</option>
      </Select>
      {nova && (
        <Input
          name="categoria_nova"
          aria-label="Nome da nova categoria"
          placeholder="Nome da nova categoria"
          maxLength={60}
          autoFocus
          className="mt-2"
        />
      )}
    </Field>
  )
}
