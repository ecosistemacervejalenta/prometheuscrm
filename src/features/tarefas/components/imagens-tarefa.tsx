'use client'

import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'

import { formatarDataHora } from '@/lib/format'
import { cn } from '@/lib/utils'

import { registrarAnexos, removerAnexo } from '../actions'
import { filtrarImagens, subirImagens } from '../imagens'
import { nomeCurto } from '../prazo'
import type { AnexoDetalhe } from '../queries'
import type { Executar } from './detalhe-tarefa'

/**
 * Galeria da tarefa: clicar amplia; "Adicionar", colar um print (Ctrl+V) em
 * qualquer ponto do cartão ou arrastar arquivos para cá envia.
 */
export function ImagensTarefa({
  tarefaId,
  imagens,
  executar,
  aoErro,
}: {
  tarefaId: string
  imagens: AnexoDetalhe[]
  executar: Executar
  aoErro: (mensagem: string | null) => void
}) {
  const [enviando, setEnviando] = useState(0)
  const [aberta, setAberta] = useState<number | null>(null)
  const [soltando, setSoltando] = useState(false)
  const seletor = useRef<HTMLInputElement>(null)
  const enviarRef = useRef<(arquivos: File[]) => void>(() => {})

  function enviar(arquivos: File[]) {
    if (!arquivos.length || enviando) return
    aoErro(null)
    setEnviando(arquivos.length)
    void (async () => {
      const { enviadas, erro } = await subirImagens(tarefaId, arquivos)
      if (erro) aoErro(erro)
      setEnviando(0)
      if (enviadas.length) executar(() => registrarAnexos(tarefaId, enviadas))
    })()
  }

  useEffect(() => {
    enviarRef.current = enviar
  })

  // Colar um print em qualquer ponto do cartão aberto anexa a imagem.
  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      const arquivos = filtrarImagens(e.clipboardData?.files)
      if (!arquivos.length) return
      e.preventDefault()
      enviarRef.current(arquivos)
    }
    document.addEventListener('paste', aoColar)
    return () => document.removeEventListener('paste', aoColar)
  }, [])

  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setSoltando(false)
    enviar(filtrarImagens(e.dataTransfer.files))
  }

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setSoltando(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setSoltando(false)}
      onDrop={soltar}
      className={cn('rounded-xl transition-colors', soltando && 'bg-volt-50 ring-2 ring-volt')}
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {imagens.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setAberta(i)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-linha bg-papel"
            title={img.nome}
          >
            {img.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- link assinado temporário do bucket privado
              <img src={img.url} alt={img.nome} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <span className="grid size-full place-items-center text-[11px] text-sutil">Indisponível</span>
            )}
          </button>
        ))}
        {Array.from({ length: enviando }, (_, i) => (
          <span key={`enviando-${i}`} className="grid aspect-square place-items-center rounded-xl border border-linha bg-superficie text-suave">
            <LoaderCircle className="size-5 animate-spin" aria-label="Enviando imagem" />
          </span>
        ))}
        <button
          type="button"
          disabled={enviando > 0}
          onClick={() => seletor.current?.click()}
          className="grid aspect-square place-items-center rounded-xl border border-dashed border-linha-forte bg-superficie text-suave hover:border-ink hover:text-ink disabled:opacity-50"
        >
          <span className="flex flex-col items-center gap-1 px-2 text-center text-[12px] font-semibold">
            <ImagePlus className="size-5" aria-hidden /> Adicionar
          </span>
        </button>
      </div>
      <p className="mt-2 text-[12px] text-sutil">Fotos ou prints — dá para colar (Ctrl+V) ou arrastar para cá.</p>
      <input
        ref={seletor}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          enviar(filtrarImagens(e.target.files))
          e.target.value = ''
        }}
      />

      {aberta !== null && imagens[aberta] && (
        <Ampliada
          imagens={imagens}
          indice={aberta}
          aoMudar={setAberta}
          aoFechar={() => setAberta(null)}
          aoRemover={(img) => {
            if (!window.confirm(`Remover a imagem "${img.nome}" da tarefa?`)) return
            setAberta(null)
            executar(() => removerAnexo(img.id))
          }}
        />
      )}
    </div>
  )
}

function Ampliada({
  imagens,
  indice,
  aoMudar,
  aoFechar,
  aoRemover,
}: {
  imagens: AnexoDetalhe[]
  indice: number
  aoMudar: (indice: number) => void
  aoFechar: () => void
  aoRemover: (img: AnexoDetalhe) => void
}) {
  const img = imagens[indice]
  const total = imagens.length
  const ir = (passo: number) => aoMudar((indice + passo + total) % total)
  const irRef = useRef(ir)
  const aoFecharRef = useRef(aoFechar)

  useEffect(() => {
    irRef.current = ir
    aoFecharRef.current = aoFechar
  })

  // Captura antes do painel: Esc fecha só a foto, setas navegam.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        aoFecharRef.current()
      } else if (e.key === 'ArrowRight') irRef.current(1)
      else if (e.key === 'ArrowLeft') irRef.current(-1)
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [])

  const botao = 'grid size-10 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white'

  return (
    <div className="animar-fundo fixed inset-0 z-[60] flex flex-col bg-ink/95" role="dialog" aria-modal="true" aria-label={img.nome}>
      <header className="flex items-center gap-2 px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2 text-white">
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[14px] font-semibold">{img.nome}</p>
          <p className="truncate text-[12px] text-white/50">
            {total > 1 && `${indice + 1} de ${total} · `}
            {img.enviado_por_nome ? `${nomeCurto(img.enviado_por_nome)} · ` : ''}
            {formatarDataHora(img.criado_em)}
          </p>
        </div>
        {img.url && (
          <a href={img.url} target="_blank" rel="noopener noreferrer" className={botao} title="Abrir original" aria-label="Abrir original">
            <ExternalLink className="size-5" aria-hidden />
          </a>
        )}
        <button type="button" onClick={() => aoRemover(img)} className={botao} title="Remover imagem" aria-label="Remover imagem">
          <Trash2 className="size-5" aria-hidden />
        </button>
        <button type="button" onClick={aoFechar} className={botao} aria-label="Fechar">
          <X className="size-6" aria-hidden />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
        {img.url && (
          // eslint-disable-next-line @next/next/no-img-element -- link assinado temporário do bucket privado
          <img src={img.url} alt={img.nome} className="max-h-full max-w-full rounded-lg object-contain" />
        )}
        {total > 1 && (
          <>
            <button type="button" onClick={() => ir(-1)} className={cn(botao, 'absolute top-1/2 left-2 size-12 -translate-y-1/2 bg-ink/40')} aria-label="Imagem anterior">
              <ChevronLeft className="size-7" aria-hidden />
            </button>
            <button type="button" onClick={() => ir(1)} className={cn(botao, 'absolute top-1/2 right-2 size-12 -translate-y-1/2 bg-ink/40')} aria-label="Próxima imagem">
              <ChevronRight className="size-7" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
