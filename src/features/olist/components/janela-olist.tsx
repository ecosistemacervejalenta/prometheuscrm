'use client'

import { Boxes, Check, ChevronDown, Loader2, Package, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'

import { classesControle } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import type { CervejaSalva } from '@/features/produtos/actions'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import { buscarProdutosNaOlist, detalhesProdutosNaOlist, importarProdutoDaOlist } from '../actions'
import type { ResultadoBuscaComEstoque } from '../estoque'

/**
 * Busca produtos na Olist sem sair da pré-venda. Ao adicionar, o produto vira cerveja do
 * catálogo (título, foto principal, preço sugerido e, se for kit, as cervejas do kit) vinculada
 * à Olist: o estoque de lá vale no link e cada venda baixa lá. Abre como <dialog> num portal
 * (fica fora do <form> da pré-venda).
 */
export function JanelaOlist({
  jaAdicionados,
  aoImportar,
  aoFechar,
}: {
  /** Ids da Olist que já estão marcados nesta pré-venda. */
  jaAdicionados: number[]
  aoImportar: (cerveja: CervejaSalva) => void
  aoFechar: () => void
}) {
  const janela = useRef<HTMLDialogElement>(null)
  const [termo, setTermo] = useState('')
  const [termoBuscado, setTermoBuscado] = useState('')
  const [resultados, setResultados] = useState<ResultadoBuscaComEstoque[] | null>(null)
  /** Quantos a Olist achou e o offset da próxima página ("Ver mais"). */
  const [total, setTotal] = useState(0)
  const [proximo, setProximo] = useState<number | null>(null)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [buscando, iniciarBusca] = useTransition()
  const [importando, setImportando] = useState<number | null>(null)
  const [adicionados, setAdicionados] = useState(() => new Set(jaAdicionados))
  const [erros, setErros] = useState<Record<number, string>>({})
  /** Resultados cuja foto e estoque ainda estão sendo consultados na Olist. */
  const [consultando, setConsultando] = useState<Set<number>>(() => new Set())
  const [semResposta, setSemResposta] = useState<Set<number>>(() => new Set())
  const [totalConsulta, setTotalConsulta] = useState(0)
  /** A Olist pediu pausa (limite de 60 consultas por minuto): segundos até continuar. */
  const [pausa, setPausa] = useState<number | null>(null)
  /** Cada busca nova (ou fechar a janela) descarta o que ainda estava na fila da anterior. */
  const buscaAtual = useRef(0)
  /** Uma fila só, consultada de 3 em 3: a Olist aceita ~3 consultas por segundo. */
  const fila = useRef<number[]>([])
  const rodando = useRef(false)

  useEffect(() => {
    janela.current?.showModal()
    return () => {
      buscaAtual.current++
      fila.current = []
    }
  }, [])

  const fechar = () => janela.current?.close()

  async function rodarFila() {
    if (rodando.current) return
    rodando.current = true
    try {
      while (fila.current.length) {
        const busca = buscaAtual.current
        const lote = fila.current.splice(0, 3)
        const detalhes = await detalhesProdutosNaOlist(lote).catch(() =>
          lote.map((id) => ({ id, foto: null, estoque: null, ok: false, espera: undefined as number | undefined })),
        )
        if (busca !== buscaAtual.current) continue // busca nova: a fila já é outra
        const porId = new Map(detalhes.filter((d) => d.ok).map((d) => [d.id, d]))
        const pausados = detalhes.filter((d) => !d.ok && d.espera).map((d) => d.id)
        const falharam = detalhes.filter((d) => !d.ok && !d.espera).map((d) => d.id)
        setResultados((atual) => atual?.map((p) => (porId.has(p.id) ? { ...p, ...porId.get(p.id)!, detalhado: true } : p)) ?? atual)
        setConsultando((atual) => new Set([...atual].filter((id) => !porId.has(id) && !falharam.includes(id))))
        if (falharam.length) setSemResposta((atual) => new Set([...atual, ...falharam]))
        if (pausados.length) {
          // Limite por minuto: volta para o começo da fila e continua sozinho depois da pausa.
          const segundos = Math.min(Math.max(...detalhes.map((d) => d.espera ?? 0)), 60)
          fila.current.unshift(...pausados)
          setPausa(segundos)
          await new Promise((resolver) => setTimeout(resolver, segundos * 1000 + 300))
          setPausa(null)
        }
      }
    } finally {
      rodando.current = false
    }
  }

  function enfileirar(ids: number[]) {
    if (ids.length === 0) return
    fila.current.push(...ids)
    setConsultando((atual) => new Set([...atual, ...ids]))
    setTotalConsulta((atual) => atual + ids.length)
    void rodarFila()
  }

  function buscar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const busca = ++buscaAtual.current
    const texto = termo.trim()
    fila.current = []
    setConsultando(new Set())
    setSemResposta(new Set())
    setTotalConsulta(0)
    setResultados(null)
    setProximo(null)
    setTotal(0)
    iniciarBusca(async () => {
      const r = await buscarProdutosNaOlist(texto)
      if (busca !== buscaAtual.current) return
      if (r.ok) {
        setTermoBuscado(texto)
        setResultados(r.produtos)
        setTotal(r.total)
        setProximo(r.proximo)
        enfileirar(r.produtos.filter((p) => !p.detalhado).map((p) => p.id))
      } else {
        setResultados(null)
        setErro(r.mensagem)
      }
    })
  }

  /** Próximos 20 da mesma busca (a foto e o estoque deles entram na mesma fila). */
  async function verMais() {
    if (proximo === null || carregandoMais) return
    const busca = buscaAtual.current
    setCarregandoMais(true)
    setErro(null)
    try {
      const r = await buscarProdutosNaOlist(termoBuscado, proximo)
      if (busca !== buscaAtual.current) return
      if (!r.ok) {
        setErro(r.mensagem)
        return
      }
      const novos = r.produtos.filter((p) => !resultados?.some((atual) => atual.id === p.id))
      setResultados((atual) => [...(atual ?? []), ...novos])
      setTotal(r.total)
      setProximo(r.proximo)
      enfileirar(novos.filter((p) => !p.detalhado).map((p) => p.id))
    } catch {
      if (busca === buscaAtual.current) setErro('Não foi possível trazer mais resultados da Olist. Tente de novo.')
    } finally {
      setCarregandoMais(false)
    }
  }

  async function adicionar(id: number) {
    setImportando(id)
    setErros((atual) => ({ ...atual, [id]: '' }))
    try {
      const r = await importarProdutoDaOlist(id)
      if (r.ok) {
        aoImportar(r.cerveja)
        setAdicionados((atual) => new Set(atual).add(id))
      } else setErros((atual) => ({ ...atual, [id]: r.mensagem }))
    } catch {
      setErros((atual) => ({ ...atual, [id]: 'Não foi possível adicionar. Tente de novo.' }))
    } finally {
      setImportando(null)
    }
  }

  const novos = [...adicionados].filter((id) => !jaAdicionados.includes(id)).length

  return createPortal(
    <dialog
      ref={janela}
      onClose={aoFechar}
      onClick={(e) => e.target === e.currentTarget && fechar()}
      aria-labelledby="titulo-janela-olist"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-papel p-0 text-ink backdrop:bg-ink/50 lg:m-auto lg:h-auto lg:max-h-[88dvh] lg:w-[min(680px,calc(100vw-48px))] lg:rounded-cartao lg:shadow-flutuante"
    >
      <div className="flex h-dvh flex-col lg:h-auto lg:max-h-[88dvh]">
        <header className="flex items-start justify-between gap-3 border-b border-linha bg-superficie px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3.5">
          <div className="min-w-0">
            <h2 id="titulo-janela-olist" className="tipo-h3">
              Buscar na Olist
            </h2>
            <p className="text-[13px] text-suave">
              Traz o título, a foto principal e o estoque. Cada cerveja que entra numa Caixa VIP baixa o estoque lá.
            </p>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-ink/5">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <form onSubmit={buscar} className="flex gap-2 border-b border-linha bg-superficie px-5 py-3.5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Nome ou SKU do produto</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-suave" aria-hidden />
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Parte do nome ou SKU (ex.: dogma ipa)"
              autoFocus
              className={cn(classesControle, 'h-11 pl-9')}
            />
          </label>
          <Button type="submit" variante="escuro" disabled={buscando || termo.trim().length < 2}>
            {buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar
          </Button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {erro && <p className="mx-5 mt-4 rounded-xl bg-perigo-50 px-4 py-3 text-[14px] text-perigo">{erro}</p>}

          {buscando && (
            <div className="px-6 py-14 text-center" role="status">
              <Loader2 className="mx-auto mb-3 size-8 animate-spin text-volt-700" aria-hidden />
              <p className="font-semibold">Buscando na Olist…</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-suave">Consultando os produtos cadastrados no ERP. Leva alguns segundos.</p>
            </div>
          )}

          {consultando.size > 0 && resultados && (
            <div
              className={cn(
                'sticky top-0 z-10 flex items-center gap-2.5 border-b border-linha px-5 py-2.5 text-[13px] text-ink',
                pausa ? 'bg-alerta-50' : 'bg-volt-50',
              )}
              role="status"
            >
              <Loader2 className={cn('size-4 shrink-0 animate-spin', pausa ? 'text-alerta' : 'text-volt-700')} aria-hidden />
              {pausa ? (
                <span>
                  A Olist pediu uma pausa (limite de consultas por minuto). Continua sozinho em cerca de{' '}
                  <b className="tipo-dado">{pausa}s</b> — já dá para adicionar.
                </span>
              ) : (
                <span>
                  Consultando foto e estoque na Olist: <b className="tipo-dado">{totalConsulta - consultando.size}</b> de{' '}
                  <b className="tipo-dado">{totalConsulta}</b>. A Olist responde poucas por segundo — já dá para adicionar.
                </span>
              )}
            </div>
          )}

          {resultados === null && !erro && !buscando && (
            <div className="px-6 py-14 text-center">
              <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-volt-50 text-volt-700">
                <Package className="size-6" aria-hidden />
              </span>
              <p className="font-semibold">Procure pelo nome ou SKU</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-suave">
                Pode digitar só parte do nome, em qualquer ordem de palavras do título (ex.: “dogma ipa”). Só produtos ativos.
              </p>
            </div>
          )}

          {resultados?.length === 0 && (
            <p className="px-6 py-14 text-center text-[14px] text-suave">Nada encontrado na Olist com “{termo.trim()}”.</p>
          )}

          {resultados && resultados.length > 0 && total > resultados.length && (
            <p className="mx-5 mt-4 rounded-xl bg-papel px-4 py-2.5 text-[13px] text-suave">
              Mostrando <b className="tipo-dado text-ink">{resultados.length}</b> de <b className="tipo-dado text-ink">{total}</b>. Use “Ver
              mais” no fim da lista, ou digite mais palavras para ir direto (ex.: “dogma hop lover”).
            </p>
          )}

          {resultados && resultados.length > 0 && (
            <ul className="divide-y divide-linha">
              {resultados.map((p) => {
                const adicionado = adicionados.has(p.id)
                const semEstoque = p.estoque !== null && p.estoque <= 0
                const aguardando = consultando.has(p.id)
                return (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={cn(
                        'relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-linha',
                        p.foto ? 'bg-white' : p.kit ? 'bg-ink text-white' : 'bg-volt-50 text-volt-700',
                      )}
                    >
                      {p.foto ? (
                        <Image src={p.foto} alt={p.nome} fill sizes="64px" className="object-contain p-0.5" />
                      ) : aguardando ? (
                        <span className="size-full animate-pulse bg-papel" aria-hidden />
                      ) : p.kit ? (
                        <Boxes className="size-6" aria-hidden />
                      ) : (
                        <Package className="size-6" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[14px] leading-5 font-semibold">{p.nome}</p>
                      <p className="tipo-dado mt-0.5 text-[12px] text-suave">
                        {[p.kit ? 'Kit' : null, p.sku ? `SKU ${p.sku}` : null, p.preco ? formatarMoeda(p.preco) : null].filter(Boolean).join(' · ')}
                      </p>
                      <p
                        className={cn(
                          'tipo-dado text-[12px] font-semibold',
                          aguardando || p.estoque === null ? 'text-suave' : semEstoque ? 'text-alerta' : 'text-volt-700',
                        )}
                      >
                        {aguardando
                          ? 'consultando a Olist…'
                          : p.estoque !== null
                            ? semEstoque
                              ? 'sem estoque'
                              : `${formatarNumero(p.estoque)} em estoque`
                            : semResposta.has(p.id)
                              ? 'a Olist não respondeu: o estoque é lido ao adicionar'
                              : 'estoque: —'}
                      </p>
                      {erros[p.id] && <p className="mt-1 text-[12px] text-perigo">{erros[p.id]}</p>}
                    </div>
                    <Button
                      tamanho="sm"
                      variante={adicionado ? 'fantasma' : 'secundario'}
                      disabled={adicionado || importando !== null}
                      onClick={() => adicionar(p.id)}
                      className="shrink-0"
                    >
                      {adicionado ? <Check /> : importando === p.id ? <Loader2 className="animate-spin" /> : null}
                      {adicionado ? 'Na pré-venda' : importando === p.id ? 'Trazendo…' : 'Adicionar'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {resultados && resultados.length > 0 && proximo !== null && (
            <div className="px-5 pt-1 pb-5">
              <Button bloco variante="secundario" disabled={carregandoMais} onClick={verMais}>
                {carregandoMais ? <Loader2 className="animate-spin" /> : <ChevronDown />}
                {carregandoMais
                  ? 'Buscando mais na Olist…'
                  : `Ver mais (${formatarNumero(Math.min(20, Math.max(total - resultados.length, 1)))} de ${formatarNumero(Math.max(total - resultados.length, 0))} restantes)`}
              </Button>
            </div>
          )}

          {resultados && resultados.length > 20 && proximo === null && (
            <p className="px-5 pt-1 pb-5 text-center text-[13px] text-suave">Fim da lista: estes são todos os produtos encontrados na Olist.</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-linha bg-superficie px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <p className="text-[13px] text-suave">{novos ? `${novos} adicionada(s) à pré-venda` : 'O estoque é conferido de novo a cada compra.'}</p>
          <Button variante="primario" onClick={fechar}>
            Pronto
          </Button>
        </footer>
      </div>
    </dialog>,
    document.body,
  )
}
