'use client'

import { ArrowRight, ClipboardCheck, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { ActionForm, SubmitButton, useFormulario, type AcaoFormulario } from '@/components/form/action-form'
import { Field, Input } from '@/components/form/fields'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatarData, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { CaixaVipDoProduto } from '../queries'
import { lerQuantidade, MAX_BALANCO, MAX_LOTES_POR_VEZ } from '../schema'

export type LoteNoBalanco = { id: string; lote: string; validade: string; quantidade: number | null }

type LoteNovo = { chave: number; lote: string; quantidade: string; validade: string }

const un = (n: number) => `${formatarNumero(n)} un.`
const comSinal = (n: number) => `${n > 0 ? '+' : '−'}${formatarNumero(Math.abs(n))}`
const emBranco = (l: LoteNovo) => !l.lote.trim() && !l.quantidade.trim() && !l.validade

/** O aviso da Caixa VIP: garrafa que ainda está na prateleira, mas já está vendida. */
function AvisoCaixaVip({ caixaVip, className }: { caixaVip: CaixaVipDoProduto; className?: string }) {
  const total = caixaVip.naOlist + caixaVip.aCaminho
  if (total === 0) return null
  return (
    <Alert tom="alerta" titulo={`${un(total)} desta cerveja ${total === 1 ? 'está' : 'estão'} em Caixa VIP ainda não separada`} className={className}>
      <p>
        Essas garrafas continuam na prateleira, mas já estão vendidas e já saíram do estoque da Olist. <strong>Não conte essas unidades</strong>:
        o número que você enviar vai exatamente igual para a Olist.
      </p>
      {caixaVip.aCaminho > 0 && (
        <p className="mt-1">
          Atenção: {un(caixaVip.aCaminho)} {caixaVip.aCaminho === 1 ? 'tem' : 'têm'} a baixa ainda a caminho da Olist e {caixaVip.aCaminho === 1 ? 'vai' : 'vão'}{' '}
          ser descontada{caixaVip.aCaminho === 1 ? '' : 's'} depois do balanço. O ideal é esperar alguns minutos e recarregar esta tela.
        </p>
      )}
    </Alert>
  )
}

/** O envio voltou com erro: fecha a janela de conferência (o erro aparece no topo do formulário). */
function FecharAoFalhar({ janela }: { janela: RefObject<HTMLDialogElement | null> }) {
  const { estado, pendente } = useFormulario()
  useEffect(() => {
    if (!pendente && estado.ok === false) janela.current?.close()
  }, [estado, pendente, janela])
  return null
}

/** O botão que envia de verdade: marca a confirmação e manda o formulário (uma vez só por clique). */
function BotaoConfirmar({ total, aoConfirmar }: { total: number; aoConfirmar: () => boolean }) {
  const { pendente } = useFormulario()
  return (
    <Button
      variante="escuro"
      tamanho="md"
      carregando={pendente}
      onClick={(evento) => {
        if (aoConfirmar()) evento.currentTarget.form?.requestSubmit()
      }}
    >
      <ClipboardCheck aria-hidden /> Sim, deixar {un(total)} na Olist
    </Button>
  )
}

/**
 * BALANÇO DE ESTOQUE: a equipe informa quanto contou de cada lote (e os lotes novos, se chegou
 * mercadoria); a soma vira o estoque da cerveja na Olist — exatamente esse número. Antes de enviar,
 * uma janela mostra o estoque de agora, o que vai ficar e a contagem, e só então o balanço segue
 * (a action recusa envio sem essa confirmação). Enter nos campos também passa pela janela.
 */
export function FormularioBalanco({
  acao,
  nome,
  lotes,
  estoqueOlist,
  caixaVip,
}: {
  acao: AcaoFormulario
  nome: string
  lotes: LoteNoBalanco[]
  /** Estoque da cerveja na Olist lido ao abrir a tela (null = a Olist não informou). */
  estoqueOlist: number | null
  caixaVip: CaixaVipDoProduto
}) {
  const janela = useRef<HTMLDialogElement>(null)
  const confirmado = useRef(false)
  /** Um balanço já saiu desta janela: clique repetido não envia outro (volta a false quando a janela fecha). */
  const emEnvio = useRef(false)
  const proxima = useRef(1)
  const [contados, setContados] = useState<Record<string, string>>(() => Object.fromEntries(lotes.map((l) => [l.id, l.quantidade === null ? '' : String(l.quantidade)])))
  const [novos, setNovos] = useState<LoteNovo[]>(() => (lotes.length === 0 ? [{ chave: 0, lote: '', quantidade: '', validade: '' }] : []))
  const [aviso, setAviso] = useState<string | null>(null)
  /** Lote novo recém-aberto por "Adicionar lote novo": o cursor já vai para ele. */
  const [recemAberto, setRecemAberto] = useState<number | null>(null)

  const contagem = lotes.map((l) => ({ ...l, contado: lerQuantidade(contados[l.id] ?? '') }))
  const novosPreenchidos = novos.filter((l) => !emBranco(l)).map((l) => ({ ...l, contado: lerQuantidade(l.quantidade) }))
  const total = [...contagem, ...novosPreenchidos].reduce((soma, l) => soma + (typeof l.contado === 'number' ? l.contado : 0), 0)
  const diferenca = estoqueOlist === null ? null : total - estoqueOlist

  /** O que falta para poder enviar (null = pode abrir a conferência). */
  function pendencia(): string | null {
    const semNumero = contagem.find((l) => typeof l.contado !== 'number')
    if (semNumero) return `Informe quanto contou do lote ${semNumero.lote} (só números; use 0 se acabou).`
    for (const l of novosPreenchidos) {
      if (!l.lote.trim()) return 'Informe o código de cada lote novo.'
      if (typeof l.contado !== 'number' || l.contado < 1) return `Informe a quantidade do lote ${l.lote.trim()} (maior que zero).`
      if (!l.validade) return `Informe a validade do lote ${l.lote.trim()}.`
    }
    if (contagem.length + novosPreenchidos.length === 0) return 'Informe ao menos um lote com a quantidade contada.'
    if (total > MAX_BALANCO) return `O total contado (${un(total)}) passa do limite de ${formatarNumero(MAX_BALANCO)} unidades por cerveja. Confira os números.`
    return null
  }

  function mudarNovo(chave: number, campo: 'lote' | 'quantidade' | 'validade', valor: string) {
    setNovos((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)))
  }

  return (
    <ActionForm
      action={acao}
      classeMensagem="mb-3"
      className="px-4 pb-4 lg:px-5"
      antesDeEnviar={(dados) => {
        // Confirmado na janela: segue para a action, com a marca da confirmação.
        if (confirmado.current) {
          confirmado.current = false
          dados.set('confirmado', 'sim')
          return true
        }
        // Qualquer outro envio (botão ou Enter num campo) abre a conferência primeiro.
        const falta = pendencia()
        setAviso(falta)
        if (!falta) janela.current?.showModal()
        return false
      }}
    >
      <FecharAoFalhar janela={janela} />
      <AvisoCaixaVip caixaVip={caixaVip} className="mb-4" />

      {lotes.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-linha">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_90px_150px] gap-3 border-b border-linha bg-papel px-3 py-2 sm:grid">
            <span className="tipo-rotulo text-suave">Lote</span>
            <span className="tipo-rotulo text-suave">Validade</span>
            <span className="tipo-rotulo text-right text-suave">No CRM</span>
            <span className="tipo-rotulo text-suave">Contado agora</span>
          </div>
          <ul className="divide-y divide-linha">
            {contagem.map((l, i) => {
              const mudou = typeof l.contado === 'number' && l.quantidade !== null && l.contado !== l.quantidade ? l.contado - l.quantidade : null
              return (
                <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_150px] items-start gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_90px_150px] sm:items-center">
                  <input type="hidden" name={`contagem.${i}.id`} value={l.id} />
                  <div className="min-w-0">
                    <p className="tipo-dado truncate text-[15px] font-semibold">{l.lote}</p>
                    <p className="text-[12px] text-suave sm:hidden">
                      Validade {formatarData(l.validade)} · no CRM {l.quantidade === null ? '—' : un(l.quantidade)}
                    </p>
                  </div>
                  <span className="tipo-dado hidden text-[13px] text-suave sm:block">{formatarData(l.validade)}</span>
                  <span className="tipo-dado hidden text-right text-[14px] sm:block">{l.quantidade === null ? '—' : formatarNumero(l.quantidade)}</span>
                  <Field label={`Quantidade contada do lote ${l.lote}`} name={`contagem.${i}.quantidade`} rotuloOculto>
                    <div className="flex items-center gap-2">
                      <Input
                        name={`contagem.${i}.quantidade`}
                        value={contados[l.id] ?? ''}
                        onChange={(e) => setContados((atuais) => ({ ...atuais, [l.id]: e.target.value }))}
                        inputMode="numeric"
                        maxLength={9}
                        placeholder="Unidades"
                        autoComplete="off"
                        autoFocus={i === 0}
                        className="tipo-dado w-24 text-right"
                      />
                      {mudou !== null && <span className={cn('tipo-dado text-[12px] font-semibold', mudou > 0 ? 'text-sucesso' : 'text-perigo')}>{comSinal(mudou)}</span>}
                    </div>
                  </Field>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className={cn(lotes.length > 0 && 'mt-4')}>
        <h3 className="text-[13px] font-semibold text-ink">{lotes.length > 0 ? 'Lotes novos (mercadoria que chegou)' : 'Lotes desta cerveja'}</h3>
        {novos.length === 0 && <p className="mt-1 text-[13px] text-suave">Nenhum lote novo neste balanço.</p>}
        <div className="mt-2 space-y-3 sm:space-y-2">
          {novos.map((l, i) => (
            <div
              key={l.chave}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_40px] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_120px_180px_40px] sm:gap-3',
                i > 0 && 'border-t border-linha pt-3 sm:border-0 sm:pt-0',
              )}
            >
              <Field label={i === 0 ? 'Lote' : `Lote novo ${i + 1}`} name={`novos.${i}.lote`} rotuloOculto={i > 0} className="col-span-full sm:col-span-1">
                <Input
                  name={`novos.${i}.lote`}
                  value={l.lote}
                  onChange={(e) => mudarNovo(l.chave, 'lote', e.target.value)}
                  maxLength={60}
                  placeholder="Ex.: L2411A"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={l.chave === recemAberto || (lotes.length === 0 && i === 0 && recemAberto === null)}
                  className="tipo-dado"
                />
              </Field>
              <Field label={i === 0 ? 'Quantidade' : `Quantidade do lote novo ${i + 1}`} name={`novos.${i}.quantidade`} rotuloOculto={i > 0}>
                <Input
                  name={`novos.${i}.quantidade`}
                  value={l.quantidade}
                  onChange={(e) => mudarNovo(l.chave, 'quantidade', e.target.value)}
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="Unidades"
                  autoComplete="off"
                  className="tipo-dado"
                />
              </Field>
              <Field label={i === 0 ? 'Validade' : `Validade do lote novo ${i + 1}`} name={`novos.${i}.validade`} rotuloOculto={i > 0}>
                <Input name={`novos.${i}.validade`} type="date" value={l.validade} onChange={(e) => mudarNovo(l.chave, 'validade', e.target.value)} min="2000-01-01" max="2100-12-31" />
              </Field>
              <Button
                tamanho="icone"
                variante="fantasma"
                className={i === 0 ? 'mt-[28px] lg:mt-[30px]' : 'mt-0.5 lg:mt-1'}
                onClick={() => setNovos((atuais) => atuais.filter((linha) => linha.chave !== l.chave))}
                title="Tirar este lote novo"
                aria-label={`Tirar o lote novo ${i + 1}`}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variante="secundario"
          className="mt-3"
          disabled={novos.length >= MAX_LOTES_POR_VEZ}
          onClick={() => {
            const chave = proxima.current++
            setNovos((atuais) => [...atuais, { chave, lote: '', quantidade: '', validade: '' }])
            setRecemAberto(chave)
          }}
        >
          <Plus /> {lotes.length > 0 || novos.length > 0 ? 'Adicionar lote novo' : 'Adicionar lote'}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-papel px-4 py-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="tipo-rotulo text-suave">Na Olist agora</p>
            <p className="tipo-numero text-[22px] leading-7">{estoqueOlist === null ? '—' : formatarNumero(estoqueOlist)}</p>
          </div>
          <ArrowRight className="mb-1.5 size-4 text-suave" aria-hidden />
          <div>
            <p className="tipo-rotulo text-suave">Total contado</p>
            <p className="tipo-numero text-[22px] leading-7">
              {formatarNumero(total)}
              <span className="ml-1 text-[13px] font-medium text-suave">un.</span>
              {diferenca !== null && diferenca !== 0 && (
                <span className={cn('tipo-dado ml-2 text-[13px] font-semibold', diferenca > 0 ? 'text-sucesso' : 'text-perigo')}>{comSinal(diferenca)}</span>
              )}
            </p>
          </div>
        </div>
        <SubmitButton>
          <ClipboardCheck /> Conferir e enviar para a Olist
        </SubmitButton>
      </div>
      {aviso && (
        <Alert tom="erro" className="mt-3">
          {aviso}
        </Alert>
      )}
      <p className="mt-3 text-[12px] leading-[18px] text-suave">
        O total contado passa a ser o estoque desta cerveja na Olist, exatamente esse número. Só o número do estoque muda lá: cadastro, preços, custo, EAN
        e peso não são tocados.
      </p>

      <dialog
        ref={janela}
        onClose={() => (emEnvio.current = false)}
        aria-label="Conferir e enviar o balanço para a Olist"
        className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-cartao bg-superficie p-5 text-ink shadow-flutuante backdrop:bg-ink/50"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="tipo-h3">Enviar este balanço para a Olist?</h2>
            <p className="mt-1 text-[13px] text-suave">{nome}</p>
          </div>
          <Button variante="fantasma" tamanho="icone" aria-label="Fechar" onClick={() => janela.current?.close()}>
            <X aria-hidden />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-4 rounded-xl bg-papel px-4 py-4 text-center">
          <div>
            <p className="tipo-rotulo text-suave">Na Olist agora</p>
            <p className="tipo-numero text-[30px] leading-9">{estoqueOlist === null ? '—' : formatarNumero(estoqueOlist)}</p>
          </div>
          <ArrowRight className="size-5 text-suave" aria-hidden />
          <div>
            <p className="tipo-rotulo text-suave">Vai ficar</p>
            <p className="tipo-numero text-[30px] leading-9">{formatarNumero(total)}</p>
          </div>
          {diferenca !== null && (
            <span className={cn('tipo-dado rounded-full px-2.5 py-1 text-[13px] font-semibold', diferenca === 0 ? 'bg-superficie text-suave' : diferenca > 0 ? 'bg-sucesso-50 text-sucesso' : 'bg-perigo-50 text-perigo')}>
              {diferenca === 0 ? 'sem mudança' : `${comSinal(diferenca)} un.`}
            </span>
          )}
        </div>

        <Alert tom="alerta" titulo="Esta ação muda o estoque na Olist de verdade" className="mt-4">
          O estoque desta cerveja na Olist passa a ser exatamente <strong>{un(total)}</strong>, mesmo que lá esteja outro número agora.
        </Alert>
        <AvisoCaixaVip caixaVip={caixaVip} className="mt-3" />

        <ul className="mt-4 divide-y divide-linha rounded-xl border border-linha">
          {contagem.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[14px]">
              <span className="min-w-0 truncate">
                <span className="tipo-dado font-semibold">{l.lote}</span> <span className="text-[12px] text-suave">validade {formatarData(l.validade)}</span>
              </span>
              <span className="tipo-dado shrink-0">
                {l.quantidade !== null && l.quantidade !== l.contado && <span className="text-suave">{formatarNumero(l.quantidade)} → </span>}
                <span className="font-semibold">{typeof l.contado === 'number' ? un(l.contado) : '—'}</span>
              </span>
            </li>
          ))}
          {novosPreenchidos.map((l) => (
            <li key={l.chave} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[14px]">
              <span className="min-w-0 truncate">
                <span className="tipo-dado font-semibold">{l.lote.trim()}</span>{' '}
                <span className="text-[12px] text-suave">lote novo · validade {l.validade ? formatarData(l.validade) : '—'}</span>
              </span>
              <span className="tipo-dado shrink-0 font-semibold">{typeof l.contado === 'number' ? un(l.contado) : '—'}</span>
            </li>
          ))}
        </ul>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-suave">
          <li>Só o número do estoque muda na Olist. Cadastro, preços, custo, EAN e peso não são tocados.</li>
          <li>Os lotes do CRM ficam iguais a esta contagem.</li>
          <li>Fica registrado no histórico da cerveja (quem fez, quando, antes e depois) e na observação do lançamento na Olist.</li>
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variante="secundario" tamanho="md" onClick={() => janela.current?.close()}>
            Voltar e corrigir
          </Button>
          <BotaoConfirmar
            total={total}
            aoConfirmar={() => {
              if (emEnvio.current) return false
              emEnvio.current = true
              confirmado.current = true
              return true
            }}
          />
        </div>
      </dialog>
    </ActionForm>
  )
}
