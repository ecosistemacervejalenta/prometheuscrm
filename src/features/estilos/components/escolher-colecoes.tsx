'use client'

import { Check, Loader2, Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import { semAcento, TIPOS_DE_COLECAO, type TipoColecao } from '../classificacao'
import { hrefDoFiltro, MAX_COLECOES, PERIODOS, SEM_COMPRA, type FiltroPublico, type Periodo, type SemCompra } from '../schema'

export type ColecaoParaEscolher = { id: string; titulo: string; tipo: TipoColecao; compradores: number }

const ABAS = TIPOS_DE_COLECAO.filter((t) => t.valor !== 'ignorar')

/**
 * Montar o público: marcar collections (estilos, cervejarias, temas), o período da compra e
 * "sem comprar há". Cada mudança vai para a URL e a página refaz o público no servidor.
 */
export function EscolherColecoes({ colecoes, filtro }: { colecoes: ColecaoParaEscolher[]; filtro: FiltroPublico }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [marcadas, setMarcadas] = useState<string[]>(filtro.colecoes)
  const [periodo, setPeriodo] = useState<Periodo>(filtro.periodo)
  const [semCompra, setSemCompra] = useState<SemCompra>(filtro.semCompra)
  const [aba, setAba] = useState<Exclude<TipoColecao, 'ignorar'>>(
    () => (colecoes.find((c) => c.id === filtro.colecoes[0])?.tipo as Exclude<TipoColecao, 'ignorar'> | undefined) ?? 'estilo',
  )
  const [busca, setBusca] = useState('')

  const porId = useMemo(() => new Map(colecoes.map((c) => [c.id, c])), [colecoes])
  const termo = semAcento(busca)
  const visiveis = colecoes
    .filter((c) => (termo ? semAcento(c.titulo).includes(termo) : c.tipo === aba))
    .sort((a, b) => b.compradores - a.compradores || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  const contagem = (tipo: TipoColecao) => colecoes.filter((c) => c.tipo === tipo && c.compradores > 0).length

  function aplicar(proximo: Partial<{ marcadas: string[]; periodo: Periodo; semCompra: SemCompra }>) {
    const filtroNovo = {
      colecoes: proximo.marcadas ?? marcadas,
      periodo: proximo.periodo ?? periodo,
      semCompra: proximo.semCompra ?? semCompra,
      tipo: filtro.tipo,
    }
    iniciar(() => router.replace(hrefDoFiltro(filtroNovo), { scroll: false }))
  }

  function alternar(id: string) {
    const proximo = marcadas.includes(id) ? marcadas.filter((m) => m !== id) : [...marcadas, id].slice(0, MAX_COLECOES)
    setMarcadas(proximo)
    aplicar({ marcadas: proximo })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-[220px] flex-1">
          <span className="sr-only">Buscar collection</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sutil" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar estilo ou cervejaria (ex.: stout, dogma)"
            className="h-11 w-full rounded-xl border border-linha bg-superficie pr-3 pl-9 text-sm outline-none placeholder:text-sutil focus:border-ink focus:ring-4 focus:ring-volt/25 lg:h-10"
          />
        </label>
        <select
          aria-label="Período da compra"
          value={periodo}
          onChange={(e) => {
            const v = e.target.value as Periodo
            setPeriodo(v)
            aplicar({ periodo: v })
          }}
          className="h-11 grow rounded-xl border border-linha bg-superficie px-3 text-sm font-medium outline-none focus:border-ink lg:h-10 lg:grow-0"
        >
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </select>
        <select
          aria-label="Última compra na loja"
          value={semCompra}
          onChange={(e) => {
            const v = e.target.value as SemCompra
            setSemCompra(v)
            aplicar({ semCompra: v })
          }}
          className="h-11 grow rounded-xl border border-linha bg-superficie px-3 text-sm font-medium outline-none focus:border-ink lg:h-10 lg:grow-0"
        >
          {SEM_COMPRA.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
      </div>

      {marcadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tipo-rotulo mr-1 text-suave">Comprou</span>
          {marcadas.map((id, i) => (
            <span key={id} className="contents">
              {i > 0 && <span className="text-xs text-suave">ou</span>}
              <button
                type="button"
                onClick={() => alternar(id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink pr-2 pl-3 text-[13px] font-medium text-white hover:bg-ink-600"
                aria-label={`Tirar ${porId.get(id)?.titulo ?? 'collection'}`}
              >
                {porId.get(id)?.titulo ?? `Collection ${id}`}
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setMarcadas([])
              aplicar({ marcadas: [] })
            }}
            className="ml-1 text-[13px] font-medium text-suave underline-offset-2 hover:text-ink hover:underline"
          >
            Limpar
          </button>
          {pendente && <Loader2 className="ml-1 size-4 animate-spin text-suave" aria-label="Atualizando o público" />}
        </div>
      )}

      {!termo && (
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink/[0.06] p-1" role="tablist" aria-label="Tipo de collection">
          {ABAS.map((t) => (
            <button
              key={t.valor}
              type="button"
              role="tab"
              aria-selected={aba === t.valor}
              onClick={() => setAba(t.valor as Exclude<TipoColecao, 'ignorar'>)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
                aba === t.valor ? 'bg-superficie text-ink shadow-sm' : 'text-suave hover:text-ink',
              )}
            >
              {t.plural}
              <span className="tipo-dado rounded-md bg-papel px-1.5 text-[11px] text-suave">{contagem(t.valor)}</span>
            </button>
          ))}
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="rounded-xl bg-papel px-4 py-6 text-center text-sm text-suave">
          {termo ? 'Nenhuma collection com esse nome.' : 'Nenhuma collection deste tipo. Organize os tipos em “Organizar collections”.'}
        </p>
      ) : (
        <ul className="grid max-h-[340px] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((c) => {
            const marcada = marcadas.includes(c.id)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => alternar(c.id)}
                  aria-pressed={marcada}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    marcada ? 'border-ink bg-ink/[0.04]' : 'border-linha hover:border-ink/40',
                    c.compradores === 0 && !marcada && 'opacity-55',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-md border',
                      marcada ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie',
                    )}
                    aria-hidden
                  >
                    {marcada && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.titulo}</span>
                  <span className="tipo-dado shrink-0 text-[12px] text-suave">
                    {c.compradores === 0 ? 'sem compras' : `${formatarNumero(c.compradores)} ${c.compradores === 1 ? 'cliente' : 'clientes'}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {termo && (
        <p className="text-[12px] text-suave">
          Buscando em todos os tipos. {visiveis.length > 0 && 'Toque para marcar; quem comprou qualquer uma das marcadas entra no público.'}
        </p>
      )}
    </div>
  )
}
