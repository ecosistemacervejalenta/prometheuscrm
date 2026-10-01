'use client'

import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import { buscarCep, mascararCep } from '@/lib/cep'
import { formatarCep, type Endereco } from '@/lib/format'

import { Field, Input } from './fields'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

/** Campos de endereço com preenchimento automático pelo CEP (ViaCEP). */
export function AddressFields({ inicial, obrigatorio = false }: { inicial?: Endereco | null; obrigatorio?: boolean }) {
  const [endereco, setEndereco] = useState({
    cep: formatarCep(inicial?.cep),
    logradouro: inicial?.logradouro ?? '',
    numero: inicial?.numero ?? '',
    complemento: inicial?.complemento ?? '',
    bairro: inicial?.bairro ?? '',
    cidade: inicial?.cidade ?? '',
    uf: inicial?.uf ?? '',
    referencia: inicial?.referencia ?? '',
  })
  const [buscando, setBuscando] = useState(false)

  const alterar = (campo: keyof typeof endereco) => (e: { target: { value: string } }) =>
    setEndereco((atual) => ({ ...atual, [campo]: e.target.value }))

  async function aoAlterarCep(valor: string) {
    const cep = mascararCep(valor)
    setEndereco((atual) => ({ ...atual, cep }))
    if (cep.replace(/\D/g, '').length !== 8) return
    setBuscando(true)
    const resultado = await buscarCep(cep)
    setBuscando(false)
    if (resultado) {
      setEndereco((atual) => ({
        ...atual,
        logradouro: resultado.logradouro || atual.logradouro,
        bairro: resultado.bairro || atual.bairro,
        cidade: resultado.cidade || atual.cidade,
        uf: resultado.uf || atual.uf,
      }))
    }
  }

  return (
    <>
      <Field label="CEP" name="cep" className="sm:col-span-2" obrigatorio={obrigatorio}>
        <div className="relative">
          <Input
            name="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={endereco.cep}
            onChange={(e) => aoAlterarCep(e.target.value)}
          />
          {buscando && (
            <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-suave" aria-label="Buscando CEP" />
          )}
        </div>
      </Field>
      <Field label="Rua / Avenida" name="logradouro" className="sm:col-span-4" obrigatorio={obrigatorio}>
        <Input name="logradouro" autoComplete="address-line1" value={endereco.logradouro} onChange={alterar('logradouro')} />
      </Field>
      <Field label="Número" name="numero" className="sm:col-span-2" obrigatorio={obrigatorio}>
        <Input name="numero" value={endereco.numero} onChange={alterar('numero')} />
      </Field>
      <Field label="Complemento" name="complemento" className="sm:col-span-4">
        <Input name="complemento" autoComplete="address-line2" placeholder="Apto, bloco..." value={endereco.complemento} onChange={alterar('complemento')} />
      </Field>
      <Field label="Bairro" name="bairro" className="sm:col-span-2" obrigatorio={obrigatorio}>
        <Input name="bairro" value={endereco.bairro} onChange={alterar('bairro')} />
      </Field>
      <Field label="Cidade" name="cidade" className="sm:col-span-3" obrigatorio={obrigatorio}>
        <Input name="cidade" autoComplete="address-level2" value={endereco.cidade} onChange={alterar('cidade')} />
      </Field>
      <Field label="UF" name="uf" className="sm:col-span-1" obrigatorio={obrigatorio}>
        <select
          id="uf"
          name="uf"
          value={endereco.uf}
          onChange={alterar('uf')}
          className="block h-11 w-full rounded-xl border border-linha bg-superficie px-2 text-[15px] outline-none focus:border-ink focus:ring-4 focus:ring-volt/25"
        >
          <option value="">—</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ponto de referência" name="referencia" className="sm:col-span-6">
        <Input name="referencia" placeholder="Ex.: portão verde, ao lado da padaria" value={endereco.referencia} onChange={alterar('referencia')} />
      </Field>
    </>
  )
}
