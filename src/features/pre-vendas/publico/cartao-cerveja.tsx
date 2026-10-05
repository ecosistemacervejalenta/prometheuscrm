'use client'

import { Beer, ChevronLeft, ChevronRight, Minus, Package, Plus } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

import type { CervejaDoKit } from '@/features/produtos/kit'
import { formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

/** O que o link mostra de cada cerveja ou kit (também usado na prévia ao cadastrar). */
export type CervejaDoLink = {
  nome: string
  estilo: string | null
  cervejaria: string | null
  volume_ml: number | null
  teor_alcoolico: number | null
  descricao: string | null
  imagem_url: string | null
  fotos: string[]
  cervejas_do_kit: CervejaDoKit[]
  preco: number
}

const teor = (n: number) => `${String(n).replace('.', ',')}%`

/** Etiquetas da cerveja (estilo, ml, ABV) — ou, no kit, quantas cervejas e de quais marcas. */
export function detalhesDa(c: Pick<CervejaDoLink, 'estilo' | 'volume_ml' | 'teor_alcoolico' | 'cervejas_do_kit'>): string[] {
  if (c.cervejas_do_kit.length > 0) {
    const unidades = c.cervejas_do_kit.reduce((s, k) => s + k.quantidade, 0)
    const marcas = [...new Set(c.cervejas_do_kit.map((k) => k.cervejaria).filter((m): m is string => Boolean(m)))]
    return [`Kit com ${unidades} ${unidades === 1 ? 'cerveja' : 'cervejas'}`, ...marcas]
  }
  return [c.estilo, c.volume_ml ? `${c.volume_ml} ml` : null, c.teor_alcoolico ? `${teor(c.teor_alcoolico)} ABV` : null].filter(
    (d): d is string => Boolean(d),
  )
}

/**
 * Textos da etapa de escolha conforme o que a pré-venda vende: só kits, só cervejas
 * avulsas ou os dois (a maioria das vendas do Grupo VIP é de kits).
 */
export function textosDaEscolha(itens: Array<Pick<CervejaDoLink, 'cervejas_do_kit'>>) {
  const kits = itens.filter((i) => i.cervejas_do_kit.length > 0).length
  if (kits > 0 && kits === itens.length) {
    return {
      titulo: 'Quantos kits você vai querer?',
      descricao: 'Selecione aqui quantos kits você quer: toque no + ou digite a quantidade.',
      vazio: 'Escolha seus kits',
      contar: (n: number) => (n === 1 ? '1 kit' : `${n} kits`),
    }
  }
  if (kits > 0) {
    return {
      titulo: 'O que você vai levar?',
      descricao: 'Selecione aqui quantos kits e cervejas você quer: toque no + ou digite a quantidade.',
      vazio: 'Escolha seus itens',
      contar: (n: number) => (n === 1 ? '1 item' : `${n} itens`),
    }
  }
  return {
    titulo: 'Quantas cervejas você vai querer?',
    descricao: 'Selecione aqui a quantidade: toque no + ou digite o número.',
    vazio: 'Escolha suas cervejas',
    contar: (n: number) => (n === 1 ? '1 cerveja' : `${n} cervejas`),
  }
}

/** Texto com a formatação do WhatsApp: *negrito* vira negrito; o resto fica como está. */
export function TextoWhatsapp({ texto }: { texto: string }) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    /^\*[^*\n]+\*$/.test(parte) ? (
      <strong key={i} className="font-semibold text-ink">
        {parte.slice(1, -1)}
      </strong>
    ) : (
      parte
    ),
  )
}

export function Miniatura({ cerveja, className }: { cerveja: Pick<CervejaDoLink, 'imagem_url'>; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-volt-50 text-volt-700', className)}>
      {cerveja.imagem_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
        <img src={cerveja.imagem_url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Beer className="size-1/2" aria-hidden />
      )}
    </span>
  )
}

/**
 * Fotos quadradas para deslizar com o dedo (iPhone/Android) ou pelas setas. As setas ficam
 * sempre à vista, discretas dos dois lados, para o cliente perceber que há mais fotos;
 * nas pontas elas dão a volta (da última para a primeira e vice-versa).
 */
function Carrossel({ slides, rotulo, selo }: { slides: ReactNode[]; rotulo: string; selo?: ReactNode }) {
  const trilho = useRef<HTMLDivElement>(null)
  const [atual, setAtual] = useState(0)
  const total = slides.length
  const irPara = (i: number) => trilho.current?.scrollTo({ left: ((i + total) % total) * trilho.current.clientWidth, behavior: 'smooth' })
  const seta = 'absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/70 text-ink/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-white/90 hover:text-ink'

  return (
    <div className="relative aspect-square w-full bg-papel" role="region" aria-roledescription="carrossel" aria-label={`Fotos de ${rotulo}`}>
      <div
        ref={trilho}
        onScroll={(e) => setAtual(Math.round(e.currentTarget.scrollLeft / Math.max(e.currentTarget.clientWidth, 1)))}
        className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div key={i} className="relative size-full shrink-0 snap-center snap-always" aria-label={`Foto ${i + 1} de ${slides.length}`}>
            {slide}
          </div>
        ))}
      </div>
      {selo}
      {slides.length > 1 && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full bg-white shadow transition-all', i === atual ? 'w-5' : 'w-1.5 opacity-60')} />
            ))}
          </div>
          <button type="button" onClick={() => irPara(atual - 1)} aria-label="Foto anterior" className={cn(seta, 'left-2.5')}>
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => irPara(atual + 1)} aria-label="Próxima foto" className={cn(seta, 'right-2.5')}>
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}

/**
 * Cartão da cerveja (ou kit) no link: fotos em destaque (carrossel quando há mais de uma),
 * etiquetas, descrição com quebras de linha e "Ler mais"; no kit, a lista do que vem nele.
 * Sem `aoDefinir`, é só prévia (o contador fica parado).
 */
export function CartaoCervejaLink({
  cerveja,
  quantidade = 0,
  aoDefinir,
  maximo = 99,
  esgotado = false,
  avisos,
  fotos,
}: {
  cerveja: CervejaDoLink
  quantidade?: number
  aoDefinir?: (n: number) => void
  maximo?: number
  esgotado?: boolean
  avisos?: string
  /** Substitui as fotos (prévia do enquadramento antes de enviar). */
  fotos?: ReactNode[]
}) {
  const [aberta, setAberta] = useState(false)
  const descricao = cerveja.descricao?.trim() ?? ''
  const kit = cerveja.cervejas_do_kit
  const longa = descricao.length > 170 || descricao.split('\n').length > 4 || kit.some((k) => (k.descricao?.length ?? 0) > 60)
  const urls = cerveja.fotos.length ? cerveja.fotos : cerveja.imagem_url ? [cerveja.imagem_url] : []
  const slides =
    fotos ??
    urls.map((url, i) => (
      // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
      <img key={url} src={url} alt={i === 0 ? cerveja.nome : ''} className="absolute inset-0 size-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} draggable={false} />
    ))
  const detalhes = detalhesDa(cerveja)

  return (
    <li
      className={cn(
        'overflow-hidden rounded-[24px] border bg-superficie transition-colors',
        quantidade > 0 ? 'border-ink ring-1 ring-ink' : 'border-linha',
        esgotado && 'opacity-60',
      )}
    >
      {slides.length > 0 && (
        <Carrossel
          slides={slides}
          rotulo={cerveja.nome}
          selo={esgotado && <span className="absolute top-3 left-3 rounded-full bg-ink px-3 py-1 text-[13px] font-semibold text-white">Esgotado</span>}
        />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {slides.length === 0 && <Miniatura cerveja={cerveja} className="size-16" />}
          <div className="min-w-0 flex-1">
            {cerveja.cervejaria && kit.length === 0 && <p className="tipo-rotulo truncate text-suave">{cerveja.cervejaria}</p>}
            <h3 className="text-[19px] leading-6 font-semibold text-balance">{cerveja.nome}</h3>
          </div>
          <p className="tipo-numero shrink-0 text-[22px] leading-6">{formatarMoeda(cerveja.preco)}</p>
        </div>

        {detalhes.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {detalhes.map((d, i) => (
              <li
                key={d}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium',
                  kit.length > 0 && i === 0 ? 'bg-ink text-white' : 'bg-papel text-ink/70',
                )}
              >
                {kit.length > 0 && i === 0 && <Package className="size-3.5" aria-hidden />}
                {d}
              </li>
            ))}
          </ul>
        )}

        {descricao && (
          <p className={cn('mt-3 text-[15px] leading-6 whitespace-pre-line text-ink/75', longa && !aberta && 'line-clamp-4')}>
            <TextoWhatsapp texto={descricao} />
          </p>
        )}

        {kit.length > 0 && (
          <div className="mt-4">
            <p className="tipo-rotulo text-suave">O que vem no kit</p>
            <ul className="mt-2 divide-y divide-linha rounded-2xl border border-linha">
              {kit.map((k, i) => (
                <li key={i} className="flex gap-3 p-3">
                  <span className="tipo-dado grid h-7 min-w-9 shrink-0 place-items-center rounded-lg bg-volt-50 px-1.5 text-[13px] font-semibold text-volt-700">
                    {k.quantidade}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-5 font-semibold">{k.nome}</p>
                    <p className="mt-0.5 text-[13px] text-suave">
                      {[k.cervejaria, k.estilo, k.teor_alcoolico ? teor(k.teor_alcoolico) : null, k.volume_ml ? `${k.volume_ml} ml` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {k.descricao && (
                      <p className={cn('mt-1 text-[14px] leading-5 whitespace-pre-line text-ink/70', !aberta && 'line-clamp-2')}>
                        <TextoWhatsapp texto={k.descricao} />
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {longa && (
          <button type="button" onClick={() => setAberta(!aberta)} className="mt-2 text-[14px] font-semibold text-volt-700 hover:text-ink">
            {aberta ? 'Ler menos' : 'Ler mais'}
          </button>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="min-w-0 text-[13px] text-suave">{esgotado ? 'Esgotado' : avisos}</p>
          {!esgotado && <Contador nome={cerveja.nome} quantidade={quantidade} maximo={maximo} aoDefinir={aoDefinir} />}
        </div>
      </div>
    </li>
  )
}

function Contador({ nome, quantidade, maximo, aoDefinir }: { nome: string; quantidade: number; maximo: number; aoDefinir?: (n: number) => void }) {
  const parado = !aoDefinir
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-papel p-1">
      <button
        type="button"
        onClick={() => aoDefinir?.(quantidade - 1)}
        disabled={parado || quantidade === 0}
        aria-label={`Tirar uma ${nome}`}
        className="grid size-11 place-items-center rounded-xl bg-superficie shadow-cartao disabled:opacity-30"
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Quantidade de ${nome}`}
        value={quantidade}
        readOnly={parado}
        onFocus={(e) => e.target.select()}
        onChange={(e) => aoDefinir?.(Number(e.target.value.replace(/\D/g, '') || 0))}
        className="campo-resposta tipo-numero h-11 w-12 bg-transparent text-center text-2xl outline-none"
      />
      <button
        type="button"
        onClick={() => aoDefinir?.(quantidade + 1)}
        disabled={parado || quantidade >= maximo}
        aria-label={`Adicionar uma ${nome}`}
        className={cn('grid size-11 place-items-center rounded-xl bg-ink text-white', parado ? 'opacity-90' : 'disabled:opacity-30')}
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  )
}
