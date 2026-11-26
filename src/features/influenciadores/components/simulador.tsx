'use client'

import { Beer, LoaderCircle, Minus, Plus, Receipt, RotateCcw, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { formatarData, formatarMoeda, formatarPorcentagem } from '@/lib/format'
import { cn } from '@/lib/utils'

import { carregarCatalogoDaLoja, carregarPedidosRecentes } from '../actions'
import type { PedidoRecente, ProdutoDaLoja } from '../catalogo'
import { formatarPercentual } from '../rotulos'
import { combinaComBusca, simularPedido, type ItemSimulado, type ResultadoDaSimulacao } from '../simulacao'

/**
 * Simulador do cadastro de influenciador: monta um pedido com produtos REAIS da loja (ou carrega
 * um pedido recente) e mostra, com o desconto e a comissão do formulário, quanto o cliente paga,
 * quanto vai para o influenciador e quanto fica para a loja. Não grava nada.
 * Fica dentro do <form> do cadastro: os campos não têm `name` e Enter nunca envia o formulário.
 */

// Cores validadas (categorical, contraste e daltonismo) — tokens da marca.
const PARTES = [
  { chave: 'loja', nome: 'Fica para a loja', cor: 'var(--color-volt-700)' },
  { chave: 'comissao', nome: 'Comissão do influenciador', cor: 'var(--color-app-700)' },
  { chave: 'desconto', nome: 'Desconto do cliente', cor: 'var(--color-etiqueta-laranja)' },
] as const

const MAX_RESULTADOS = 8
const MAX_QUANTIDADE = 99

type Catalogo = { estado: 'carregando' } | { estado: 'pronto'; produtos: ProdutoDaLoja[] } | { estado: 'erro'; mensagem: string }

function Miniatura({ src, className }: { src?: string | null; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-papel ring-1 ring-linha', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura da CDN da Shopify (já redimensionada por ?width=)
        <img src={src} alt="" loading="lazy" className="size-full object-contain" />
      ) : (
        <Beer className="size-4 text-sutil" aria-hidden />
      )}
    </span>
  )
}

/** Busca no catálogo da loja com lista de sugestões (setas, Enter e Esc). */
function BuscaDeProdutos({ catalogo, aoEscolher }: { catalogo: Catalogo; aoEscolher: (p: ProdutoDaLoja) => void }) {
  const [termo, setTermo] = useState('')
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const idLista = useId()

  const resultados = useMemo(() => {
    if (catalogo.estado !== 'pronto' || termo.trim().length < 2) return []
    return catalogo.produtos
      .filter((p) => combinaComBusca(`${p.titulo} ${p.sku ?? ''}`, termo))
      .sort((a, b) => Number(b.disponivel) - Number(a.disponivel))
      .slice(0, MAX_RESULTADOS)
  }, [catalogo, termo])

  const escolher = (p: ProdutoDaLoja) => {
    aoEscolher(p)
    setTermo('')
    setAberta(false)
    setAtivo(0)
  }

  const mostrarLista = aberta && termo.trim().length >= 2 && catalogo.estado === 'pronto'

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sutil" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrarLista && resultados[ativo] ? `${idLista}-${ativo}` : undefined}
        aria-label="Buscar produto da loja"
        autoComplete="off"
        spellCheck={false}
        value={termo}
        disabled={catalogo.estado === 'erro'}
        placeholder={catalogo.estado === 'carregando' ? 'Carregando os produtos da loja…' : 'Buscar cerveja, kit ou SKU da loja'}
        onChange={(e) => {
          setTermo(e.target.value)
          setAberta(true)
          setAtivo(0)
        }}
        onFocus={() => setAberta(true)}
        onBlur={() => setTimeout(() => setAberta(false), 120)}
        onKeyDown={(e) => {
          // Dentro do formulário do cadastro: Enter escolhe o produto, nunca envia o cadastro.
          if (e.key === 'Enter') {
            e.preventDefault()
            if (mostrarLista && resultados[ativo]) escolher(resultados[ativo])
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setAberta(true)
            setAtivo((i) => Math.min(i + 1, Math.max(resultados.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setAtivo((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Escape') {
            setAberta(false)
          }
        }}
        className="h-11 w-full rounded-xl border border-linha bg-superficie pr-3 pl-9 text-[15px] outline-none placeholder:text-sutil focus:border-ink focus:ring-4 focus:ring-volt/25 disabled:bg-papel"
      />
      {catalogo.estado === 'carregando' && (
        <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-sutil" aria-hidden />
      )}

      {mostrarLista && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[360px] overflow-y-auto rounded-xl border border-linha bg-superficie p-1 shadow-flutuante"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-[13px] text-suave">Nenhum produto da loja com “{termo.trim()}”.</li>
          ) : (
            resultados.map((p, i) => (
              <li
                key={p.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={i === ativo}
                onMouseEnter={() => setAtivo(i)}
                // mousedown: escolhe antes de o campo perder o foco.
                onMouseDown={(e) => {
                  e.preventDefault()
                  escolher(p)
                }}
                className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5', i === ativo && 'bg-papel')}
              >
                <Miniatura src={p.imagem} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] leading-[18px] font-medium">{p.titulo}</span>
                  {!p.disponivel && <span className="tipo-rotulo text-[10px] text-alerta">sem estoque na loja</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="tipo-dado block text-[13px] font-semibold">{formatarMoeda(p.preco)}</span>
                  {p.precoDe && <span className="tipo-dado block text-[11px] text-sutil line-through">{formatarMoeda(p.precoDe)}</span>}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

/** Barra única dividida em loja / comissão / desconto (o todo = produtos a preço de loja). */
function BarraDaDivisao({ resultado }: { resultado: ResultadoDaSimulacao }) {
  const [ativa, setAtiva] = useState<number | null>(null)
  const valores = [resultado.loja, resultado.comissao, resultado.desconto]
  const total = resultado.produtos
  const partes = PARTES.map((p, i) => ({ ...p, valor: valores[i], fracao: total > 0 ? valores[i] / total : 0 })).filter((p) => p.valor > 0)

  // Centro de cada parte (fração da barra), para posicionar a dica.
  const posicoes = partes.map((p, i) => partes.slice(0, i).reduce((soma, anterior) => soma + anterior.fracao, 0) + p.fracao / 2)
  const destaque = ativa !== null ? partes[ativa] : null

  return (
    <div>
      <div className="relative">
        <div
          className="flex h-7 w-full gap-[2px]"
          role="img"
          aria-label={`Divisão dos ${formatarMoeda(total)} em produtos: ${partes.map((p) => `${p.nome} ${formatarMoeda(p.valor)} (${formatarPorcentagem(p.fracao)})`).join('; ')}.`}
        >
          {partes.map((p, i) => (
            <div
              key={p.chave}
              tabIndex={0}
              aria-label={`${p.nome}: ${formatarMoeda(p.valor)}, ${formatarPorcentagem(p.fracao)} dos produtos`}
              onMouseEnter={() => setAtiva(i)}
              onMouseLeave={() => setAtiva(null)}
              onFocus={() => setAtiva(i)}
              onBlur={() => setAtiva(null)}
              className="flex h-full min-w-0 items-center rounded-[4px] px-2 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1"
              style={{ flexGrow: p.fracao, flexBasis: 0, background: p.cor }}
            >
              {p.fracao >= 0.12 && <span className="tipo-dado truncate text-[12px] font-semibold text-white">{formatarPorcentagem(p.fracao)}</span>}
            </div>
          ))}
        </div>
        {destaque && ativa !== null && (
          <div
            className="pointer-events-none absolute bottom-[calc(100%+8px)] z-10 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] whitespace-nowrap text-white shadow-flutuante"
            style={{ left: `${Math.min(Math.max(posicoes[ativa] * 100, 18), 82)}%` }}
          >
            <span className="font-semibold">{destaque.nome}</span>
            <span className="tipo-dado ml-2 text-[12px] text-white/80">
              {formatarMoeda(destaque.valor)} · {formatarPorcentagem(destaque.fracao)}
            </span>
          </div>
        )}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
        {partes.map((p) => (
          <li key={p.chave} className="flex items-center gap-1.5 text-[12px] font-medium text-ink/80">
            <span className="size-2.5 rounded-[3px]" style={{ background: p.cor }} aria-hidden />
            {p.nome}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Linha({ rotulo, detalhe, valor, cor, negativo = false, forte = false }: { rotulo: string; detalhe?: string; valor: number; cor?: string; negativo?: boolean; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('flex min-w-0 items-center gap-2', forte ? 'font-semibold text-ink' : 'text-ink/80')}>
        {cor && <span className="size-2.5 shrink-0 translate-y-px rounded-[3px]" style={{ background: cor }} aria-hidden />}
        <span className="min-w-0">
          {rotulo}
          {detalhe && <span className="ml-1 text-[12px] text-suave">{detalhe}</span>}
        </span>
      </dt>
      <dd className={cn('tipo-dado shrink-0', forte ? 'font-semibold' : '')}>
        {negativo && valor > 0 ? '− ' : ''}
        {formatarMoeda(valor)}
      </dd>
    </div>
  )
}

export function SimuladorDePedido({ desconto, comissao, cupom }: { desconto: number; comissao: number; cupom: string }) {
  const [catalogo, setCatalogo] = useState<Catalogo>({ estado: 'carregando' })
  const [itens, setItens] = useState<ItemSimulado[]>([])
  const [origem, setOrigem] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState<PedidoRecente[] | null>(null)
  const [erroPedidos, setErroPedidos] = useState<string | null>(null)
  const [verPedidos, setVerPedidos] = useState(false)
  const [buscandoPedidos, iniciarBuscaDePedidos] = useTransition()
  const tentativa = useRef(0)

  /** Lê o catálogo da loja (o estado "carregando" é marcado por quem chama). */
  const buscarCatalogo = useCallback(() => {
    const minha = ++tentativa.current
    carregarCatalogoDaLoja()
      .then((r) => {
        if (minha !== tentativa.current) return
        setCatalogo(r.ok ? { estado: 'pronto', produtos: r.produtos } : { estado: 'erro', mensagem: r.mensagem })
      })
      .catch(() => {
        if (minha === tentativa.current) setCatalogo({ estado: 'erro', mensagem: 'Não foi possível ler os produtos da loja agora.' })
      })
  }, [])

  // Ao abrir a tela (o estado já nasce "carregando").
  useEffect(() => buscarCatalogo(), [buscarCatalogo])

  const tentarDeNovo = () => {
    setCatalogo({ estado: 'carregando' })
    buscarCatalogo()
  }

  const resultado = useMemo(() => simularPedido(itens, desconto, comissao), [itens, desconto, comissao])

  const adicionar = (p: ProdutoDaLoja) =>
    setItens((atuais) => {
      const existente = atuais.find((i) => i.chave === p.id)
      if (existente) return atuais.map((i) => (i.chave === p.id ? { ...i, quantidade: Math.min(i.quantidade + 1, MAX_QUANTIDADE) } : i))
      return [...atuais, { chave: p.id, titulo: p.titulo, preco: p.preco, quantidade: 1, imagem: p.imagem, sku: p.sku }]
    })

  const mudarQuantidade = (chave: string, delta: number) =>
    setItens((atuais) =>
      atuais.flatMap((i) => {
        if (i.chave !== chave) return [i]
        const quantidade = Math.min(i.quantidade + delta, MAX_QUANTIDADE)
        return quantidade <= 0 ? [] : [{ ...i, quantidade }]
      }),
    )

  const abrirPedidos = () => {
    setVerPedidos((v) => !v)
    if (pedidos || buscandoPedidos) return
    iniciarBuscaDePedidos(async () => {
      const r = await carregarPedidosRecentes()
      if (r.ok) {
        setPedidos(r.pedidos)
        setErroPedidos(null)
      } else setErroPedidos(r.mensagem)
    })
  }

  const usarPedido = (p: PedidoRecente) => {
    setItens(
      p.itens.map((i, n) => ({
        chave: `${p.numero}-${n}`,
        titulo: i.titulo,
        preco: i.preco,
        quantidade: Math.min(i.quantidade, MAX_QUANTIDADE),
        imagem: i.imagem,
        sku: i.sku,
      })),
    )
    setOrigem(`Itens do pedido ${p.numero}, de ${formatarData(p.criadoEm)}, com os preços daquele dia.`)
    setVerPedidos(false)
  }

  const limpar = () => {
    setItens([])
    setOrigem(null)
  }

  const codigo = cupom.trim()
  const semComissao = !(comissao > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <BuscaDeProdutos
            catalogo={catalogo}
            aoEscolher={(p) => {
              adicionar(p)
              setOrigem(null)
            }}
          />
        </div>
        <Button variante="secundario" onClick={abrirPedidos} aria-expanded={verPedidos} carregando={buscandoPedidos}>
          {!buscandoPedidos && <Receipt aria-hidden />}
          Usar um pedido recente
        </Button>
      </div>

      {catalogo.estado === 'erro' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-alerta-50 px-3.5 py-2.5 text-[13px] text-ink/80">
          <span className="min-w-0 flex-1 basis-60">{catalogo.mensagem}</span>
          <Button variante="secundario" tamanho="sm" onClick={tentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      )}

      {verPedidos && (
        <div className="rounded-xl border border-linha bg-superficie">
          <p className="tipo-rotulo border-b border-linha px-3.5 py-2.5 text-suave">Últimos pedidos da loja</p>
          {buscandoPedidos ? (
            <p className="px-3.5 py-3 text-[13px] text-suave">Lendo os pedidos na Shopify…</p>
          ) : erroPedidos ? (
            <p className="px-3.5 py-3 text-[13px] text-perigo">{erroPedidos}</p>
          ) : pedidos && pedidos.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] text-suave">Nenhum pedido recente na loja.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-linha overflow-y-auto">
              {pedidos?.map((p) => (
                <li key={p.numero}>
                  <button
                    type="button"
                    onClick={() => usarPedido(p)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-papel/70 focus-visible:bg-papel focus-visible:outline-none"
                  >
                    <span className="tipo-dado w-14 shrink-0 font-semibold">{p.numero}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-suave">
                      {formatarData(p.criadoEm)} · {p.itens.reduce((s, i) => s + i.quantidade, 0)} un. · {p.itens[0]?.titulo}
                      {p.itens.length > 1 ? ` + ${p.itens.length - 1}` : ''}
                      {p.cancelado ? ' · cancelado' : ''}
                    </span>
                    <span className="tipo-dado shrink-0 text-[13px] font-semibold">{formatarMoeda(p.produtos)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-linha-forte px-5 py-8 text-center">
          <p className="font-semibold">Monte um pedido para ver a conta</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-suave">
            Busque cervejas e kits da loja (preços de hoje) ou carregue um pedido que já aconteceu. O simulador usa o desconto e a comissão
            preenchidos acima e não grava nada.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[13px] text-suave">{origem ?? 'Produtos da loja, com os preços de hoje.'}</p>
              <Button variante="fantasma" tamanho="sm" onClick={limpar}>
                <RotateCcw aria-hidden /> Limpar
              </Button>
            </div>
            <ul className="divide-y divide-linha rounded-xl border border-linha">
              {itens.map((i) => (
                <li key={i.chave} className="flex items-center gap-3 px-3 py-2.5">
                  <Miniatura src={i.imagem} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] leading-[18px] font-medium">{i.titulo}</p>
                    <p className="tipo-dado text-[12px] text-suave">{formatarMoeda(i.preco)} cada</p>
                  </div>
                  <div className="flex shrink-0 items-center rounded-lg border border-linha" role="group" aria-label={`Quantidade de ${i.titulo}`}>
                    <button
                      type="button"
                      onClick={() => mudarQuantidade(i.chave, -1)}
                      aria-label="Tirar uma unidade"
                      className="grid size-8 place-items-center rounded-l-lg text-suave hover:bg-papel hover:text-ink"
                    >
                      <Minus className="size-3.5" aria-hidden />
                    </button>
                    <span className="tipo-dado w-7 text-center text-[13px]" aria-live="polite">
                      {i.quantidade}
                    </span>
                    <button
                      type="button"
                      onClick={() => mudarQuantidade(i.chave, 1)}
                      disabled={i.quantidade >= MAX_QUANTIDADE}
                      aria-label="Pôr mais uma unidade"
                      className="grid size-8 place-items-center rounded-r-lg text-suave hover:bg-papel hover:text-ink disabled:opacity-40"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <p className="tipo-dado hidden w-24 shrink-0 text-right text-[13px] font-semibold sm:block">{formatarMoeda(i.preco * i.quantidade)}</p>
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(i.chave, -i.quantidade)}
                    aria-label={`Tirar ${i.titulo}`}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-sutil hover:bg-papel hover:text-perigo"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <section aria-label="Resultado da simulação" className="rounded-2xl bg-papel p-4">
            <dl className="space-y-2 text-[14px]">
              <Linha rotulo="Produtos" detalhe={`${resultado.unidades} un.`} valor={resultado.produtos} />
              <Linha rotulo="Desconto do cupom" detalhe={formatarPercentual(desconto)} valor={resultado.desconto} cor={PARTES[2].cor} negativo />
              <div className="border-t border-linha pt-2">
                <Linha rotulo="Cliente paga" detalhe="sem frete" valor={resultado.clientePaga} />
              </div>
              <Linha rotulo="Comissão" detalhe={formatarPercentual(comissao)} valor={resultado.comissao} cor={PARTES[1].cor} negativo />
            </dl>

            <div className="mt-3 border-t border-linha pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="size-2.5 rounded-[3px]" style={{ background: PARTES[0].cor }} aria-hidden />
                  Fica para a loja
                </p>
                <p className="tipo-numero text-[26px] leading-8">{formatarMoeda(resultado.loja)}</p>
              </div>
            </div>

            <div className="mt-4">
              <BarraDaDivisao resultado={resultado} />
            </div>

            <p className="mt-4 text-[13px] leading-5 text-ink/80">
              Neste pedido o cupom{codigo && <b className="tipo-dado text-[13px]"> {codigo}</b>} custa <b>{formatarMoeda(resultado.custoDoPrograma)}</b> à loja —{' '}
              <b>{formatarPorcentagem(resultado.custoDoProgramaFracao)}</b> do valor dos produtos ({formatarMoeda(resultado.desconto)} de desconto +{' '}
              {formatarMoeda(resultado.comissao)} de comissão).
            </p>
            {semComissao && <p className="mt-2 text-[12px] font-medium text-alerta">Preencha a comissão acima para ver a conta completa.</p>}
            <p className="mt-2 text-[12px] leading-4 text-suave">
              Antes do custo das cervejas e do frete — o frete não entra no desconto nem na comissão. O desconto segue a conta do checkout da
              Shopify.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
