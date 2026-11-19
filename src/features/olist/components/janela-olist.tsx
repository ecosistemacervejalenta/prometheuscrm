'use client'

import { Boxes, Check, Loader2, Package, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { classesControle } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import type { CervejaSalva } from '@/features/produtos/actions'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import { buscarProdutosNaOlist, importarProdutoDaOlist } from '../actions'
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
  const [resultados, setResultados] = useState<ResultadoBuscaComEstoque[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [buscando, iniciarBusca] = useTransition()
  const [importando, setImportando] = useState<number | null>(null)
  const [adicionados, setAdicionados] = useState(() => new Set(jaAdicionados))
  const [erros, setErros] = useState<Record<number, string>>({})

  useEffect(() => {
    janela.current?.showModal()
  }, [])

  const fechar = () => janela.current?.close()

  function buscar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    iniciarBusca(async () => {
      const r = await buscarProdutosNaOlist(termo)
      if (r.ok) setResultados(r.produtos)
      else {
        setResultados(null)
        setErro(r.mensagem)
      }
    })
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

          {resultados === null && !erro && (
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

          {resultados && resultados.length >= 30 && (
            <p className="mx-5 mt-4 rounded-xl bg-papel px-4 py-2.5 text-[13px] text-suave">
              Mostrando os 30 primeiros. Digite mais palavras para achar a cerveja certa (ex.: “dogma hop lover”).
            </p>
          )}

          {resultados && resultados.length > 0 && (
            <ul className="divide-y divide-linha">
              {resultados.map((p) => {
                const adicionado = adicionados.has(p.id)
                const semEstoque = p.estoque !== null && p.estoque <= 0
                return (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', p.kit ? 'bg-ink text-white' : 'bg-volt-50 text-volt-700')}>
                      {p.kit ? <Boxes className="size-5" aria-hidden /> : <Package className="size-5" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{p.nome}</p>
                      <p className="tipo-dado truncate text-[12px] text-suave">
                        {[p.kit ? 'Kit' : null, p.sku ? `SKU ${p.sku}` : null, p.preco ? formatarMoeda(p.preco) : null].filter(Boolean).join(' · ')}
                      </p>
                      {erros[p.id] && <p className="mt-1 text-[12px] text-perigo">{erros[p.id]}</p>}
                    </div>
                    <span className={cn('tipo-dado shrink-0 text-right text-[13px]', semEstoque ? 'text-alerta' : 'text-ink')}>
                      {p.estoque === null ? '—' : semEstoque ? 'sem estoque' : `${formatarNumero(p.estoque)} em estoque`}
                    </span>
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
