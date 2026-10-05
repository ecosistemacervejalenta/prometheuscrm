'use client'

import { FileSpreadsheet, MapPin, RotateCcw, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useState, useTransition, type DragEvent, type FormEvent } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Checkbox, Field, MoneyInput, Textarea } from '@/components/form/fields'
import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { mascararCep } from '@/lib/cep'
import { formatarDataHora, formatarNumero, valorParaInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { decodificarTexto, lerPlanilhaExcel, lerTexto } from '@/features/leads/planilha'

import { salvarValorFreteVip, substituirCepsVip, testarCepVip } from '../actions'
import { analisarCeps, cepParaTexto, formatarCepNumero, linhasDoTexto, MAX_FAIXAS } from '../ceps'
import type { ResumoCeps } from '../queries'

const EXCEL = ['xlsx', 'xls', 'xlsm', 'ods']
const TEXTO = ['csv', 'txt', 'tsv']
const TAMANHO_MAXIMO = 20 * 1024 * 1024

export function FormularioValorFrete({ valor }: { valor: number }) {
  return (
    <ActionForm action={salvarValorFreteVip}>
      <Field label="Frete fixo para CEPs da lista" name="frete_vip_valor" dica="Somado automaticamente aos pedidos do link.">
        <MoneyInput name="frete_vip_valor" defaultValue={valorParaInput(valor)} />
      </Field>
      <div className="mt-4 flex justify-end">
        <SubmitButton variante="secundario">Salvar valor</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function TestarCep() {
  const [cep, setCep] = useState('')
  const [resultado, setResultado] = useState<{ cep: string; vip: boolean } | { erro: string } | null>(null)
  const [pendente, iniciar] = useTransition()

  function testar(evento: FormEvent) {
    evento.preventDefault()
    iniciar(async () => {
      const r = await testarCepVip(cep)
      setResultado(r.ok ? { cep, vip: Boolean(r.vip) } : { erro: r.mensagem ?? 'Não foi possível testar.' })
    })
  }

  return (
    <form onSubmit={testar}>
      <div className="flex gap-2">
        <input
          value={cep}
          onChange={(e) => {
            setCep(mascararCep(e.target.value))
            setResultado(null)
          }}
          inputMode="numeric"
          placeholder="00000-000"
          aria-label="CEP para testar"
          className="tipo-dado block h-11 w-full min-w-0 rounded-xl border border-linha bg-superficie px-3.5 outline-none focus:border-ink focus:ring-4 focus:ring-volt/25"
        />
        <Button type="submit" carregando={pendente} disabled={cep.replace(/\D/g, '').length !== 8}>
          <Search /> Testar
        </Button>
      </div>
      {resultado && (
        <p
          className={cn(
            'mt-3 rounded-xl px-3 py-2 text-sm font-semibold',
            'erro' in resultado ? 'bg-perigo-50 text-perigo' : resultado.vip ? 'bg-volt-50 text-volt-700' : 'bg-alerta-50 text-alerta',
          )}
          role="status"
        >
          {'erro' in resultado
            ? resultado.erro
            : resultado.vip
              ? `${resultado.cep}: está na lista — frete fixo.`
              : `${resultado.cep}: fora da lista — frete a cotar.`}
        </p>
      )}
    </form>
  )
}

type Planilha = { nome: string; linhas: string[][]; abas: string[]; aba: string | null; buffer: ArrayBuffer | null }

function descreverResumo(r: ResumoCeps) {
  const partes = []
  if (r.ceps_avulsos) partes.push(`${formatarNumero(r.ceps_avulsos)} CEP(s)`)
  if (r.faixas) partes.push(`${formatarNumero(r.faixas)} faixa(s)`)
  return partes.join(' + ')
}

/** Lista de CEPs VIP: situação atual + importação de planilha (XLS/XLSX/CSV) ou texto colado. */
export function ListaCepsVip({ resumo, arquivo, importadoEm }: { resumo: ResumoCeps; arquivo: string | null; importadoEm: string | null }) {
  const avisar = useAvisos()
  const [modo, setModo] = useState<'arquivo' | 'colar'>('arquivo')
  const [planilha, setPlanilha] = useState<Planilha | null>(null)
  const [texto, setTexto] = useState('')
  const [duasColunasComoFaixa, setDuasColunasComoFaixa] = useState<boolean | undefined>(undefined)
  const [lendo, setLendo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const linhas = useMemo(() => (modo === 'arquivo' ? (planilha?.linhas ?? []) : linhasDoTexto(texto)), [modo, planilha, texto])
  const analise = useMemo(() => (linhas.length ? analisarCeps(linhas, duasColunasComoFaixa) : null), [linhas, duasColunasComoFaixa])
  const temLista = resumo.ceps_cobertos > 0

  function limpar() {
    setPlanilha(null)
    setTexto('')
    setDuasColunasComoFaixa(undefined)
    setErro(null)
  }

  async function aoEscolher(file: File | undefined) {
    if (!file) return
    setErro(null)
    setDuasColunasComoFaixa(undefined)
    if (file.size > TAMANHO_MAXIMO) return setErro('Arquivo maior que 20 MB.')
    const extensao = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (![...EXCEL, ...TEXTO].includes(extensao)) return setErro('Formato não suportado. Envie XLS, XLSX, CSV ou TXT.')
    setLendo(true)
    try {
      const buffer = await file.arrayBuffer()
      if (EXCEL.includes(extensao)) {
        const lida = lerPlanilhaExcel(await import('xlsx'), buffer)
        setPlanilha({ nome: file.name, linhas: lida.linhas, abas: lida.abas, aba: lida.aba, buffer })
      } else {
        setPlanilha({ nome: file.name, linhas: lerTexto(decodificarTexto(buffer)), abas: [], aba: null, buffer: null })
      }
    } catch (e) {
      console.error(e)
      setErro('Não foi possível ler o arquivo. Se for uma planilha protegida, salve uma cópia sem senha.')
    } finally {
      setLendo(false)
    }
  }

  async function trocarAba(aba: string) {
    if (!planilha?.buffer) return
    const lida = lerPlanilhaExcel(await import('xlsx'), planilha.buffer, aba)
    setDuasColunasComoFaixa(undefined)
    setPlanilha({ ...planilha, linhas: lida.linhas, aba: lida.aba })
  }

  function soltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setArrastando(false)
    aoEscolher(e.dataTransfer.files[0])
  }

  function salvar() {
    if (!analise || analise.faixas.length === 0) return
    if (analise.faixas.length > MAX_FAIXAS) return setErro(`A lista passou do limite de ${formatarNumero(MAX_FAIXAS)} CEPs/faixas.`)
    setErro(null)
    iniciar(async () => {
      const r = await substituirCepsVip(
        analise.faixas.map(([inicio, fim]) => [cepParaTexto(inicio), cepParaTexto(fim)]),
        modo === 'arquivo' ? (planilha?.nome ?? null) : 'Lista colada',
      )
      if (!r.ok) return setErro(r.mensagem)
      avisar(`Lista de CEPs VIP atualizada: ${descreverResumo(r.resumo)}.`)
      limpar()
    })
  }

  return (
    <div className="space-y-5">
      {temLista ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-volt-50 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-superficie text-volt-700 shadow-cartao">
            <MapPin className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {descreverResumo(resumo)} · {formatarNumero(resumo.ceps_cobertos)} CEP(s) com frete fixo
            </p>
            <p className="text-[13px] text-suave">
              {[arquivo, importadoEm ? `atualizada em ${formatarDataHora(importadoEm)}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <ActionButton
            acao={async () => {
              const r = await substituirCepsVip([], null)
              return r.ok ? { ok: true, mensagem: 'Lista de CEPs VIP removida.' } : { ok: false, mensagem: r.mensagem }
            }}
            confirmar="Remover toda a lista de CEPs VIP? Todos os pedidos do link passam a ficar com frete a cotar."
            variante="fantasma"
            titulo="Remover lista"
          >
            <Trash2 /> <span className="max-sm:sr-only">Remover</span>
          </ActionButton>
        </div>
      ) : (
        <Alert tom="alerta" titulo="Nenhum CEP cadastrado">
          Enquanto a lista estiver vazia, todos os pedidos do link ficam com frete a cotar.
        </Alert>
      )}

      <div className="flex gap-1 rounded-xl bg-ink/[0.06] p-1" role="tablist" aria-label="Como enviar a lista">
        {(['arquivo', 'colar'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => {
              setModo(m)
              setDuasColunasComoFaixa(undefined)
              setErro(null)
            }}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
              modo === m ? 'bg-superficie text-ink shadow-sm' : 'text-suave hover:text-ink',
            )}
          >
            {m === 'arquivo' ? 'Enviar planilha' : 'Colar CEPs'}
          </button>
        ))}
      </div>

      {modo === 'arquivo' ? (
        planilha ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel p-3">
            <span className="grid size-10 place-items-center rounded-xl bg-superficie shadow-cartao">
              <FileSpreadsheet className="size-5 text-volt-700" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{planilha.nome}</p>
              <p className="text-[13px] text-suave">{formatarNumero(planilha.linhas.length)} linha(s)</p>
            </div>
            {planilha.abas.length > 1 && (
              <select
                value={planilha.aba ?? ''}
                onChange={(e) => trocarAba(e.target.value)}
                aria-label="Aba da planilha"
                className="h-9 rounded-lg border border-linha bg-superficie px-2 text-[13px] font-medium"
              >
                {planilha.abas.map((aba) => (
                  <option key={aba} value={aba}>
                    {aba}
                  </option>
                ))}
              </select>
            )}
            <Button tamanho="sm" variante="fantasma" onClick={limpar}>
              <RotateCcw /> Trocar
            </Button>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltar}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              arrastando ? 'border-volt bg-volt-50' : 'border-linha-forte bg-papel hover:border-ink/40',
            )}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-superficie text-ink shadow-cartao">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className="text-[15px] font-semibold">{lendo ? 'Lendo a planilha…' : 'Arraste a planilha aqui ou toque para escolher'}</span>
            <span className="text-[13px] text-suave">XLS · XLSX · CSV · TXT</span>
            <input
              type="file"
              accept=".xls,.xlsx,.xlsm,.ods,.csv,.txt,.tsv"
              className="sr-only"
              disabled={lendo}
              onChange={(e) => aoEscolher(e.target.files?.[0])}
            />
          </label>
        )
      ) : (
        <Field label="CEPs" name="ceps_colados" dica="Um CEP ou faixa por linha. Pode colar direto do Excel.">
          <Textarea
            name="ceps_colados"
            rows={7}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'01310-100\n04538-133\n01000-000 a 01999-999'}
            className="tipo-dado text-[13px]"
          />
        </Field>
      )}

      {erro && <Alert tom="erro">{erro}</Alert>}

      {analise &&
        (analise.faixas.length === 0 ? (
          <Alert tom="alerta" titulo="Nenhum CEP encontrado">
            Confira se a planilha tem uma coluna com os CEPs (ex.: 01310-100) ou faixas (ex.: 01000-000 a 01999-999).
          </Alert>
        ) : (
          <div className="rounded-2xl border border-linha p-4">
            <p className="tipo-rotulo text-suave">Prévia da nova lista</p>
            <p className="mt-1 text-[15px] font-semibold">
              {[
                analise.avulsos ? `${formatarNumero(analise.avulsos)} CEP(s)` : null,
                analise.intervalos ? `${formatarNumero(analise.intervalos)} faixa(s)` : null,
              ]
                .filter(Boolean)
                .join(' + ')}{' '}
              → {formatarNumero(analise.cobertos)} CEP(s) com frete fixo
            </p>
            {analise.ignoradas > 0 && (
              <p className="text-[13px] text-suave">{formatarNumero(analise.ignoradas)} linha(s) sem CEP foram ignoradas.</p>
            )}
            {analise.temDuasColunas && (
              <Checkbox
                className="mt-3"
                label="As duas colunas de CEP são faixas (CEP inicial e CEP final)"
                descricao="Desmarque se forem CEPs avulsos lado a lado."
                checked={analise.comoFaixa}
                onChange={(e) => setDuasColunasComoFaixa(e.target.checked)}
              />
            )}
            <ul className="tipo-dado mt-3 flex flex-wrap gap-1.5 text-[12px]">
              {analise.faixas.slice(0, 12).map(([inicio, fim]) => (
                <li key={inicio} className="rounded-md bg-papel px-2 py-0.5">
                  {inicio === fim ? formatarCepNumero(inicio) : `${formatarCepNumero(inicio)} a ${formatarCepNumero(fim)}`}
                </li>
              ))}
              {analise.faixas.length > 12 && <li className="px-1 py-0.5 text-suave">+{formatarNumero(analise.faixas.length - 12)}</li>}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              {temLista && <p className="text-[13px] text-suave">A lista atual será substituída por esta.</p>}
              <Button variante="primario" onClick={salvar} carregando={enviando} className="max-sm:w-full">
                {temLista ? 'Substituir lista' : 'Salvar lista'}
              </Button>
            </div>
          </div>
        ))}
    </div>
  )
}
