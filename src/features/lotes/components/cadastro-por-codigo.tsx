'use client'

import { useEffect, useRef } from 'react'
import { ScanBarcode, Search } from 'lucide-react'

import { ActionForm, SubmitButton, useFormulario } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'

import { cadastrarCervejaPorCodigo } from '../actions'

/**
 * Bipa o código de barras (EAN) ou digita o SKU → o CRM consulta a Olist, cadastra a cerveja e
 * abre a tela dos lotes dela. O leitor de código de barras "digita" o número e aperta Enter,
 * então bipar já faz a busca.
 */
export function CadastroPorCodigo() {
  return (
    <ActionForm action={cadastrarCervejaPorCodigo} classeMensagem="mb-3">
      <CampoDoCodigo />
    </ActionForm>
  )
}

/** Foco está num lugar onde a pessoa digita (aí a tecla é dela, não do leitor). */
function digitandoEmOutroCampo() {
  const ativo = document.activeElement
  if (!(ativo instanceof HTMLElement) || ativo === document.body) return false
  return ativo.isContentEditable || ativo.matches('input, textarea, select')
}

function CampoDoCodigo() {
  const campo = useRef<HTMLInputElement>(null)
  const { estado, pendente } = useFormulario()

  // No computador o campo já abre pronto para o leitor. No celular não, para o teclado não subir sozinho.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) campo.current?.focus()
  }, [])

  // Bipou com o cursor fora de qualquer campo: o código vem para cá e substitui o anterior.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey || evento.key.length !== 1 || evento.key === ' ') return
      if (!campo.current || digitandoEmOutroCampo()) return
      campo.current.select() // a tecla segue para o campo, já em foco
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [])

  // Não achou: o código fica selecionado, e a próxima bipada entra no lugar (em vez de grudar no anterior).
  useEffect(() => {
    if (!pendente && estado.ok === false) campo.current?.select()
  }, [estado, pendente])

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <Field label="Código de barras (EAN) ou SKU da cerveja na Olist" name="codigo" rotuloOculto className="flex-1">
        <div className="relative">
          <ScanBarcode className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-suave" aria-hidden />
          <Input
            ref={campo}
            name="codigo"
            maxLength={60}
            placeholder="Bipe o código de barras ou digite o SKU"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            className="tipo-dado pl-11"
          />
        </div>
      </Field>
      <SubmitButton className="lg:mt-0.5">
        <Search /> Buscar na Olist
      </SubmitButton>
    </div>
  )
}
