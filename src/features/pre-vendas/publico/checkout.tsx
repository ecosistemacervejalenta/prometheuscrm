'use client'

import { ArrowLeft, Beer, CircleCheck, MapPin, MessageCircle, Minus, Plus } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { AddressFields } from '@/components/form/address-fields'
import { Field, Input, Textarea } from '@/components/form/fields'
import { Icone } from '@/components/marca/marca'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonExternal } from '@/components/ui/button'
import { formatarData, formatarDataHora, formatarMoeda, numeroPedido } from '@/lib/format'
import { cn } from '@/lib/utils'
import { linkWhatsapp, mascararWhatsapp } from '@/lib/whatsapp'

import { confirmarPedidoPreVenda, identificarCliente, type Identificacao } from './actions'
import type { PreVendaPublica } from './queries'

type Etapa = 'whatsapp' | 'cervejas' | 'entrega' | 'concluido'

const ETAPAS: Array<{ chave: Exclude<Etapa, 'concluido'>; rotulo: string }> = [
  { chave: 'whatsapp', rotulo: 'Você' },
  { chave: 'cervejas', rotulo: 'Cervejas' },
  { chave: 'entrega', rotulo: 'Entrega' },
]

const CAMPOS_ENDERECO = ['logradouro', 'numero', 'bairro', 'cidade', 'uf'] as const

/**
 * Fluxo público da pré-venda (mobile first):
 * 1. WhatsApp → reconhece quem já é cliente   2. escolha das cervejas
 * 3. entrega + resumo → confirma               4. pedido confirmado
 */
export function CheckoutPreVenda({ dados, whatsappInicial }: { dados: PreVendaPublica; whatsappInicial?: string }) {
  const { preVenda, itens, loja } = dados
  const [etapa, setEtapa] = useState<Etapa>('whatsapp')
  const [whatsapp, setWhatsapp] = useState(mascararWhatsapp(whatsappInicial?.replace(/^55/, '') ?? ''))
  const [cliente, setCliente] = useState<Identificacao | null>(null)
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [outroEndereco, setOutroEndereco] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ numero: number; total: number } | null>(null)
  const [pendente, iniciar] = useTransition()

  const selecionados = itens.filter((i) => (quantidades[i.produto_id] ?? 0) > 0)
  const unidades = selecionados.reduce((s, i) => s + quantidades[i.produto_id], 0)
  const subtotal = selecionados.reduce((s, i) => s + i.preco * quantidades[i.produto_id], 0)
  const total = subtotal + (unidades > 0 ? preVenda.taxa_entrega : 0)
  const precisaEndereco = !cliente?.encontrado || !cliente.tem_endereco || outroEndereco

  const maximo = (item: (typeof itens)[number]) =>
    Math.min(item.limite_por_cliente ?? Infinity, item.restante ?? Infinity, 99)

  function alterar(item: (typeof itens)[number], delta: number) {
    setQuantidades((atual) => {
      const nova = Math.max(0, Math.min((atual[item.produto_id] ?? 0) + delta, maximo(item)))
      return { ...atual, [item.produto_id]: nova }
    })
  }

  function identificar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    iniciar(async () => {
      const r = await identificarCliente(preVenda.slug, whatsapp)
      if (!r.ok) return setErro(r.mensagem)
      setCliente(r.cliente)
      setEtapa('cervejas')
    })
  }

  function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro(null)
    const form = new FormData(evento.currentTarget)
    const valor = (campo: string) => String(form.get(campo) ?? '').trim()

    if (!cliente?.encontrado && !valor('nome')) return setErro('Informe seu nome.')
    if (precisaEndereco && CAMPOS_ENDERECO.some((c) => !valor(c))) {
      return setErro('Preencha o endereço completo: rua, número, bairro, cidade e UF.')
    }

    iniciar(async () => {
      const r = await confirmarPedidoPreVenda({
        slug: preVenda.slug,
        whatsapp,
        itens: selecionados.map((i) => ({ produto_id: i.produto_id, quantidade: quantidades[i.produto_id] })),
        atualizarEndereco: precisaEndereco,
        observacoes: valor('observacoes') || undefined,
        armadilha: valor('site') || undefined,
        cliente: {
          nome: valor('nome') || undefined,
          email: valor('email') || undefined,
          cep: valor('cep') || undefined,
          logradouro: valor('logradouro') || undefined,
          numero: valor('numero') || undefined,
          complemento: valor('complemento') || undefined,
          bairro: valor('bairro') || undefined,
          cidade: valor('cidade') || undefined,
          uf: valor('uf') || undefined,
          referencia: valor('referencia') || undefined,
        },
      })
      if (!r.ok) return setErro(r.mensagem)
      setResultado({ numero: r.numero, total: r.total })
      setEtapa('concluido')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  // ---------------------------------------------------------------------------
  if (etapa === 'concluido' && resultado) {
    return (
      <div className="text-center">
        <div className="rounded-[28px] bg-volt px-6 py-10">
          <CircleCheck className="mx-auto size-14 text-ink" strokeWidth={1.5} aria-hidden />
          <p className="tipo-rotulo mt-4 text-ink/70">Pedido confirmado</p>
          <p className="tipo-h1 mt-1">{numeroPedido(resultado.numero)}</p>
          <p className="mt-2 text-lg font-semibold">{formatarMoeda(resultado.total)}</p>
        </div>
        <ul className="mt-6 space-y-2 rounded-2xl border border-linha bg-superficie p-5 text-left text-sm">
          {selecionados.map((i) => (
            <li key={i.produto_id} className="flex justify-between gap-3">
              <span><span className="tipo-dado font-semibold">{quantidades[i.produto_id]}×</span> {i.nome}</span>
              <span className="tipo-dado">{formatarMoeda(i.preco * quantidades[i.produto_id])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-suave">
          Tudo certo{cliente?.encontrado ? `, ${cliente.primeiro_nome}` : ''}! Você vai receber o resumo e os dados de pagamento pelo
          WhatsApp. {preVenda.previsao_entrega && `Previsão de entrega: ${formatarData(preVenda.previsao_entrega)}.`}
        </p>
        {loja.whatsapp && (
          <ButtonExternal
            href={linkWhatsapp(loja.whatsapp, `Oi! Acabei de fazer o pedido ${numeroPedido(resultado.numero)} na pré-venda "${preVenda.titulo}".`)}
            variante="whatsapp"
            tamanho="lg"
            bloco
            className="mt-6"
          >
            <MessageCircle /> Falar com a {loja.nome}
          </ButtonExternal>
        )}
      </div>
    )
  }

  return (
    <div className="pb-28">
      {/* Progresso */}
      <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Etapas">
        {ETAPAS.map((e, i) => {
          const indiceAtual = ETAPAS.findIndex((x) => x.chave === etapa)
          return (
            <li key={e.chave} className="text-center">
              <span className={cn('block h-1 rounded-full', i <= indiceAtual ? 'bg-ink' : 'bg-linha')} />
              <span className={cn('tipo-rotulo mt-1.5 block', i === indiceAtual ? 'text-ink' : 'text-sutil')}>{e.rotulo}</span>
            </li>
          )
        })}
      </ol>

      {erro && <Alert tom="erro" className="mb-4">{erro}</Alert>}

      {/* 1 · WhatsApp */}
      {etapa === 'whatsapp' && (
        <>
          <section className="rounded-[28px] bg-volt p-6">
            <p className="tipo-rotulo text-ink/70">Pré-venda · {loja.nome}</p>
            <h1 className="tipo-h2 mt-2">{preVenda.titulo}</h1>
            {preVenda.descricao && <p className="mt-3 whitespace-pre-line text-ink/80">{preVenda.descricao}</p>}
            <div className="tipo-dado mt-4 space-y-0.5 text-[13px] text-ink/70">
              {preVenda.encerra_em && <p>Encerra {formatarDataHora(preVenda.encerra_em)}</p>}
              {preVenda.previsao_entrega && <p>Entrega prevista {formatarData(preVenda.previsao_entrega)}</p>}
            </div>
          </section>

          <form onSubmit={identificar} className="mt-6 rounded-[24px] border border-linha bg-superficie p-5">
            <label htmlFor="whatsapp" className="tipo-h3 block">Qual é o seu WhatsApp?</label>
            <p className="mt-1 text-sm text-suave">Se você já comprou com a gente, puxamos seus dados automaticamente.</p>
            <input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
              placeholder="(11) 98765-4321"
              className="tipo-dado mt-4 h-14 w-full rounded-2xl border border-linha bg-papel px-4 text-lg outline-none focus:border-ink focus:ring-4 focus:ring-volt/30"
              autoFocus
            />
            <Button type="submit" variante="escuro" tamanho="lg" bloco className="mt-4" carregando={pendente}>
              Continuar
            </Button>
          </form>
        </>
      )}

      {/* 2 · Cervejas */}
      {etapa === 'cervejas' && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Icone tamanho={36} />
            <div>
              <p className="tipo-h3">{cliente?.encontrado ? `Bom te ver, ${cliente.primeiro_nome}!` : 'Bem-vindo(a)!'}</p>
              <p className="text-sm text-suave">Escolha suas cervejas da {preVenda.titulo}.</p>
            </div>
          </div>

          <ul className="space-y-3">
            {itens.map((item) => {
              const qtd = quantidades[item.produto_id] ?? 0
              const esgotado = item.restante !== null && item.restante <= 0
              const limite = maximo(item)
              return (
                <li
                  key={item.produto_id}
                  className={cn(
                    'flex gap-3 rounded-[20px] border bg-superficie p-3 transition-colors',
                    qtd > 0 ? 'border-ink' : 'border-linha',
                    esgotado && 'opacity-50',
                  )}
                >
                  <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-volt-50 text-volt-700">
                    {item.imagem_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
                      <img src={item.imagem_url} alt={item.nome} className="size-full object-cover" />
                    ) : (
                      <Beer className="size-8" aria-hidden />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="leading-5 font-semibold">{item.nome}</p>
                    <p className="text-[12px] text-suave">
                      {[item.estilo, item.volume_ml ? `${item.volume_ml} ml` : null, item.teor_alcoolico ? `${String(item.teor_alcoolico).replace('.', ',')}%` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {item.descricao && <p className="mt-1 line-clamp-2 text-[13px] text-suave">{item.descricao}</p>}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <div>
                        <p className="tipo-numero text-lg">{formatarMoeda(item.preco)}</p>
                        <p className="text-[11px] text-suave">
                          {esgotado
                            ? 'Esgotado'
                            : [item.restante !== null && item.restante <= 30 ? `restam ${item.restante}` : null, item.limite_por_cliente ? `máx. ${item.limite_por_cliente} por pessoa` : null]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                      </div>
                      {!esgotado && (
                        <div className="flex items-center gap-1">
                          {qtd > 0 && (
                            <>
                              <button type="button" onClick={() => alterar(item, -1)} className="grid size-9 place-items-center rounded-xl border border-linha" aria-label={`Remover ${item.nome}`}>
                                <Minus className="size-4" />
                              </button>
                              <span className="tipo-dado w-7 text-center text-base">{qtd}</span>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => alterar(item, 1)}
                            disabled={qtd >= limite}
                            className="grid size-9 place-items-center rounded-xl bg-ink text-white disabled:opacity-30"
                            aria-label={`Adicionar ${item.nome}`}
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <BarraInferior>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-white/60">{unidades} item(ns)</p>
              <p className="tipo-numero text-xl text-white">{formatarMoeda(subtotal)}</p>
            </div>
            <Button variante="primario" tamanho="lg" disabled={unidades === 0} onClick={() => { setErro(null); setEtapa('entrega') }}>
              Continuar
            </Button>
          </BarraInferior>
        </>
      )}

      {/* 3 · Entrega e confirmação */}
      {etapa === 'entrega' && (
        <form onSubmit={confirmar} noValidate>
          <button type="button" onClick={() => setEtapa('cervejas')} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-suave hover:text-ink">
            <ArrowLeft className="size-4" /> Voltar às cervejas
          </button>

          {/* Campo invisível anti-robô */}
          <input type="text" name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <section className="rounded-[24px] border border-linha bg-superficie p-5">
            <h2 className="tipo-h3">Entrega</h2>

            {cliente?.encontrado && cliente.tem_endereco && !outroEndereco ? (
              <div className="mt-3 rounded-2xl bg-papel p-4">
                <p className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-volt-700" aria-hidden />
                  <span>
                    Entregaremos no endereço do seu cadastro:
                    <span className="mt-1 block font-semibold">{cliente.endereco_resumo}</span>
                  </span>
                </p>
                <button type="button" onClick={() => setOutroEndereco(true)} className="mt-3 text-sm font-semibold text-volt-700 hover:text-ink">
                  Entregar em outro endereço
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-6">
                {!cliente?.encontrado && (
                  <>
                    <Field label="Nome completo" name="nome" obrigatorio className="sm:col-span-6">
                      <Input name="nome" autoComplete="name" />
                    </Field>
                    <Field label="E-mail (opcional)" name="email" className="sm:col-span-6">
                      <Input name="email" type="email" autoComplete="email" />
                    </Field>
                  </>
                )}
                <AddressFields obrigatorio />
                {cliente?.encontrado && (
                  <p className="text-[13px] text-suave sm:col-span-6">Este passa a ser o endereço do seu cadastro.</p>
                )}
              </div>
            )}

            <Field label="Observações (opcional)" name="observacoes" className="mt-4">
              <Textarea name="observacoes" rows={2} placeholder="Ex.: entregar após as 18h, interfone 32" />
            </Field>
          </section>

          <section className="mt-4 rounded-[24px] border border-linha bg-superficie p-5">
            <h2 className="tipo-h3">Resumo</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {selecionados.map((i) => (
                <li key={i.produto_id} className="flex justify-between gap-3">
                  <span><span className="tipo-dado font-semibold">{quantidades[i.produto_id]}×</span> {i.nome}</span>
                  <span className="tipo-dado">{formatarMoeda(i.preco * quantidades[i.produto_id])}</span>
                </li>
              ))}
              {preVenda.taxa_entrega > 0 && (
                <li className="flex justify-between gap-3 text-suave">
                  <span>Entrega</span>
                  <span className="tipo-dado">{formatarMoeda(preVenda.taxa_entrega)}</span>
                </li>
              )}
            </ul>
            <p className="text-[13px] text-suave mt-4">O pagamento é combinado pelo WhatsApp depois da confirmação.</p>
          </section>

          <BarraInferior>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-white/60">Total</p>
              <p className="tipo-numero text-xl text-white">{formatarMoeda(total)}</p>
            </div>
            <Button type="submit" variante="primario" tamanho="lg" carregando={pendente}>
              Confirmar pedido
            </Button>
          </BarraInferior>
        </form>
      )}
    </div>
  )
}

function BarraInferior({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-[22px] bg-ink px-4 py-3 shadow-flutuante">{children}</div>
    </div>
  )
}
