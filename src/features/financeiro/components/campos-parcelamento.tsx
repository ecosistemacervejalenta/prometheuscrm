'use client'

import { useState } from 'react'

import { Field, Input, MoneyInput } from '@/components/form/fields'
import { formatarData, formatarMoeda, lerDinheiro } from '@/lib/format'

import { gerarParcelas, type ModoValor } from '../regras'

/**
 * Valor, 1º vencimento e parcelas de um lançamento novo, com a escolha
 * "o valor é o total / é de cada parcela" e uma prévia do que será lançado.
 * Cada parcela vira uma conta no mês do seu vencimento.
 */
export function CamposParcelamento({ hoje }: { hoje: string }) {
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState(hoje)
  const [parcelas, setParcelas] = useState('1')
  const [modo, setModo] = useState<ModoValor>('total')

  const qtd = Number(parcelas)
  const parcelado = Number.isInteger(qtd) && qtd > 1
  const numero = lerDinheiro(valor)
  const previa =
    parcelado && qtd <= 36 && numero > 0 && /^\d{4}-\d{2}-\d{2}$/.test(vencimento)
      ? gerarParcelas({ descricao: '', valor: numero, modo, parcelas: qtd, vencimento })
      : null

  return (
    <>
      <Field
        label={parcelado ? (modo === 'total' ? 'Valor total' : 'Valor de cada parcela') : 'Valor'}
        name="valor"
        obrigatorio
        className="sm:col-span-2"
      >
        <MoneyInput name="valor" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Field>
      <Field label={parcelado ? '1º vencimento' : 'Vencimento'} name="vencimento" obrigatorio className="sm:col-span-2">
        <Input name="vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
      </Field>
      <Field label="Parcelas" name="parcelas" className="sm:col-span-2" dica="1 = à vista">
        <Input
          name="parcelas"
          type="number"
          inputMode="numeric"
          min={1}
          max={36}
          value={parcelas}
          onChange={(e) => setParcelas(e.target.value)}
        />
      </Field>

      {parcelado ? (
        <div className="rounded-xl border border-linha bg-papel p-4 sm:col-span-6">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold">O valor informado é</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              {(
                [
                  ['total', `O total (dividido em ${qtd} parcelas)`],
                  ['parcela', `De cada parcela (${qtd} × o valor)`],
                ] as const
              ).map(([opcao, rotulo]) => (
                <label key={opcao} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="modo_valor"
                    value={opcao}
                    checked={modo === opcao}
                    onChange={() => setModo(opcao)}
                    className="size-4 accent-[#0a0e14]"
                  />
                  {rotulo}
                </label>
              ))}
            </div>
          </fieldset>
          {previa && <Previa parcelas={previa} />}
        </div>
      ) : (
        <input type="hidden" name="modo_valor" value="total" />
      )}
    </>
  )
}

function Previa({ parcelas }: { parcelas: Array<{ valor: number; vencimento: string }> }) {
  const total = parcelas.reduce((s, p) => s + p.valor, 0)
  const [primeira, ...demais] = parcelas
  const iguais = demais.every((p) => p.valor === primeira.valor)

  return (
    <p className="mt-3 border-t border-linha pt-3 text-[13px] text-suave">
      Serão lançadas <strong className="text-ink">{parcelas.length} contas</strong>, uma por mês:{' '}
      <span className="tipo-dado text-ink">
        {iguais
          ? `${parcelas.length} × ${formatarMoeda(primeira.valor)}`
          : `1ª de ${formatarMoeda(primeira.valor)} + ${demais.length} × ${formatarMoeda(demais[0].valor)}`}
      </span>{' '}
      · total <span className="tipo-dado text-ink">{formatarMoeda(total)}</span> · vencimentos de{' '}
      <span className="tipo-dado text-ink">{formatarData(primeira.vencimento)}</span> a{' '}
      <span className="tipo-dado text-ink">{formatarData(parcelas[parcelas.length - 1].vencimento)}</span>.
    </p>
  )
}
