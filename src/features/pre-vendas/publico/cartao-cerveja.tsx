'use client'

import { Beer, Minus, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

/** O que o link mostra de cada cerveja (também usado na prévia ao cadastrar). */
export type CervejaDoLink = {
  nome: string
  estilo: string | null
  cervejaria: string | null
  volume_ml: number | null
  teor_alcoolico: number | null
  descricao: string | null
  imagem_url: string | null
  preco: number
}

export const detalhesDa = (c: Pick<CervejaDoLink, 'estilo' | 'volume_ml' | 'teor_alcoolico'>) =>
  [c.estilo, c.volume_ml ? `${c.volume_ml} ml` : null, c.teor_alcoolico ? `${String(c.teor_alcoolico).replace('.', ',')}% ABV` : null].filter(
    (d): d is string => Boolean(d),
  )

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
 * Cartão da cerveja no link: com foto, a foto ganha destaque (quadrada, largura toda);
 * sem foto, fica compacto. A descrição respeita as quebras de linha e abre com "Ler mais".
 * Sem `aoDefinir`, é só prévia (o contador fica parado).
 */
export function CartaoCervejaLink({
  cerveja,
  quantidade = 0,
  aoDefinir,
  maximo = 99,
  esgotado = false,
  avisos,
  foto,
}: {
  cerveja: CervejaDoLink
  quantidade?: number
  aoDefinir?: (n: number) => void
  maximo?: number
  esgotado?: boolean
  avisos?: string
  /** Substitui a foto (prévia do enquadramento antes de enviar). */
  foto?: ReactNode
}) {
  const [aberta, setAberta] = useState(false)
  const descricao = cerveja.descricao?.trim() ?? ''
  const longa = descricao.length > 170 || descricao.split('\n').length > 4
  const temFoto = Boolean(foto ?? cerveja.imagem_url)
  const detalhes = detalhesDa(cerveja)

  return (
    <li
      className={cn(
        'overflow-hidden rounded-[24px] border bg-superficie transition-colors',
        quantidade > 0 ? 'border-ink ring-1 ring-ink' : 'border-linha',
        esgotado && 'opacity-60',
      )}
    >
      {temFoto && (
        <div className="relative aspect-square w-full overflow-hidden bg-papel">
          {foto ?? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
            <img src={cerveja.imagem_url ?? ''} alt={cerveja.nome} className="absolute inset-0 size-full object-cover" loading="lazy" />
          )}
          {esgotado && <span className="absolute top-3 left-3 rounded-full bg-ink px-3 py-1 text-[13px] font-semibold text-white">Esgotado</span>}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {!temFoto && <Miniatura cerveja={cerveja} className="size-16" />}
          <div className="min-w-0 flex-1">
            {cerveja.cervejaria && <p className="tipo-rotulo truncate text-suave">{cerveja.cervejaria}</p>}
            <h3 className="text-[19px] leading-6 font-semibold text-balance">{cerveja.nome}</h3>
          </div>
          <p className="tipo-numero shrink-0 text-[22px] leading-6">{formatarMoeda(cerveja.preco)}</p>
        </div>

        {detalhes.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {detalhes.map((d) => (
              <li key={d} className="rounded-full bg-papel px-2.5 py-0.5 text-[13px] font-medium text-ink/70">
                {d}
              </li>
            ))}
          </ul>
        )}

        {descricao && (
          <div className="mt-3">
            <p className={cn('text-[15px] leading-6 whitespace-pre-line text-ink/75', longa && !aberta && 'line-clamp-4')}>
              <TextoWhatsapp texto={descricao} />
            </p>
            {longa && (
              <button type="button" onClick={() => setAberta(!aberta)} className="mt-1 text-[14px] font-semibold text-volt-700 hover:text-ink">
                {aberta ? 'Ler menos' : 'Ler mais'}
              </button>
            )}
          </div>
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
