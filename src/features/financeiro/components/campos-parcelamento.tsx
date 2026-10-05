'use client'

import { Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { useFormulario } from '@/components/form/action-form'
import { Field, Input, MoneyInput } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import { formatarData, formatarMoeda, lerDinheiro } from '@/lib/format'
import { cn } from '@/lib/utils'

import { gerarParcelas, MAXIMO_BOLETOS, type ModoValor } from '../regras'

type Boleto = { chave: number; valor: string; vencimento: string }

/**
 * Valor, 1º vencimento e parcelas de um lançamento novo, com a escolha
 * "o valor é o total / é de cada parcela" e uma prévia do que será lançado.
 * Cada parcela vira uma conta no mês do seu vencimento.
 *
 * Com `variosBoletos`, o lançamento à vista pode virar uma lista de boletos da mesma
 * empresa, cada um com valor e vencimento próprios (campos "boletos.N.valor/vencimento").
 */
export function CamposParcelamento({ hoje, variosBoletos = false }: { hoje: string; variosBoletos?: boolean }) {
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState(hoje)
  const [parcelas, setParcelas] = useState('1')
  const [modo, setModo] = useState<ModoValor>('total')
  const [boletos, setBoletos] = useState<Boleto[] | null>(null)
  const ultimaChave = useRef(0)

  const novoBoleto = (inicial?: Partial<Boleto>): Boleto => ({
    chave: ++ultimaChave.current,
    valor: '',
    vencimento: '',
    ...inicial,
  })

  if (boletos) {
    return (
      <ListaBoletos
        boletos={boletos}
        adicionar={() => setBoletos([...boletos, novoBoleto()])}
        alterar={(chave, campo, novo) =>
          setBoletos(boletos.map((b) => (b.chave === chave ? { ...b, [campo]: novo } : b)))
        }
        remover={(chave) => {
          const restantes = boletos.filter((b) => b.chave !== chave)
          if (restantes.length > 1) return setBoletos(restantes)
          // Sobrou um: volta ao lançamento simples, com os dados do boleto que ficou.
          setValor(restantes[0].valor)
          setVencimento(restantes[0].vencimento || hoje)
          setParcelas('1')
          setBoletos(null)
        }}
      />
    )
  }

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

      {variosBoletos && !parcelado && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-6">
          <Button
            variante="secundario"
            tamanho="sm"
            onClick={() => setBoletos([novoBoleto({ valor, vencimento }), novoBoleto()])}
          >
            <Plus /> Adicionar outro boleto
          </Button>
          <span className="text-[13px] text-suave">A mesma empresa mandou mais de um boleto? Lance todos de uma vez.</span>
        </div>
      )}
    </>
  )
}

function ListaBoletos({
  boletos,
  adicionar,
  alterar,
  remover,
}: {
  boletos: Boleto[]
  adicionar: () => void
  alterar: (chave: number, campo: 'valor' | 'vencimento', novo: string) => void
  remover: (chave: number) => void
}) {
  const { estado } = useFormulario()
  const erroDaLista = estado.erros?.boletos?.[0]
  const total = boletos.reduce((soma, b) => soma + lerDinheiro(b.valor), 0)

  return (
    <div className="rounded-xl border border-linha bg-papel p-4 sm:col-span-6">
      <fieldset>
        <legend className="mb-3 text-[13px] font-semibold">Boletos desta empresa</legend>
        <ol className="flex flex-col gap-3">
          {boletos.map((boleto, i) => {
            const primeiro = i === 0
            return (
              <li
                key={boleto.chave}
                className="grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 sm:gap-3"
              >
                <span
                  aria-hidden
                  className={cn('tipo-dado text-[13px] leading-11 text-suave', primeiro && 'mt-[26px]')}
                >
                  {i + 1}
                </span>
                <Field
                  label={primeiro ? 'Valor' : `Valor do boleto ${i + 1}`}
                  rotuloOculto={!primeiro}
                  name={`boletos.${i}.valor`}
                  obrigatorio
                >
                  <MoneyInput
                    name={`boletos.${i}.valor`}
                    value={boleto.valor}
                    onChange={(e) => alterar(boleto.chave, 'valor', e.target.value)}
                    // Foca o boleto que acabou de ser adicionado (o último a montar).
                    autoFocus={!primeiro && i === boletos.length - 1}
                  />
                </Field>
                <Field
                  label={primeiro ? 'Vencimento' : `Vencimento do boleto ${i + 1}`}
                  rotuloOculto={!primeiro}
                  name={`boletos.${i}.vencimento`}
                  obrigatorio
                >
                  <Input
                    name={`boletos.${i}.vencimento`}
                    type="date"
                    value={boleto.vencimento}
                    onChange={(e) => alterar(boleto.chave, 'vencimento', e.target.value)}
                  />
                </Field>
                <Button
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Remover boleto ${i + 1}`}
                  title="Remover boleto"
                  onClick={() => remover(boleto.chave)}
                  className={primeiro ? 'mt-[28px]' : 'mt-0.5'}
                >
                  <X />
                </Button>
              </li>
            )
          })}
        </ol>
      </fieldset>

      {erroDaLista && <p className="mt-3 text-[13px] font-medium text-perigo">{erroDaLista}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-linha pt-3">
        <Button variante="secundario" tamanho="sm" onClick={adicionar} disabled={boletos.length >= MAXIMO_BOLETOS}>
          <Plus /> Adicionar boleto
        </Button>
        <p className="text-[13px] text-suave">
          Serão lançadas <strong className="text-ink">{boletos.length} contas</strong>, uma por boleto · total{' '}
          <span className="tipo-dado text-ink">{formatarMoeda(total)}</span>
        </p>
      </div>
    </div>
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
