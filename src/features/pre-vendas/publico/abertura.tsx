'use client'

import { ArrowRight, CalendarClock, Truck } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'

import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

import { detalhesDa, Miniatura, TextoWhatsapp, type CervejaDoLink } from './cartao-cerveja'
import { classeBotaoGrande } from './estilos'

export type PreVendaDoLink = {
  titulo: string
  descricao: string | null
  grupoVip: boolean
  encerra_em: string | null
  previsao_entrega: string | null
}

/** Foto de perfil da Cerveja Lenta VIP: redonda e centralizada, como um perfil do Instagram. */
export function PerfilDaLoja({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center', className)}>
      <span className="grid size-[76px] place-items-center rounded-full bg-superficie p-1 shadow-cartao ring-1 ring-linha">
        <Image src="/brand/cerveja-lenta-vip.png" alt="Cerveja Lenta VIP" width={68} height={68} priority className="size-full rounded-full object-contain" />
      </span>
    </div>
  )
}

/**
 * Primeira tela do link: foto em destaque, título, descrição, prazos, cervejas e frete.
 * Usada no link de verdade e no mockup de iPhone do cadastro (sem `aoComecar`, o botão é só ilustrativo).
 */
export function AberturaPreVenda({
  preVenda,
  itens,
  nomeLoja,
  freteVip,
  aoComecar,
  capa,
}: {
  preVenda: PreVendaDoLink
  itens: CervejaDoLink[]
  nomeLoja: string
  freteVip: number
  aoComecar?: () => void
  /** Substitui a foto de destaque (prévia de foto ainda não enviada). */
  capa?: ReactNode
}) {
  const fotoDestaque = itens.find((i) => i.imagem_url)?.imagem_url ?? null
  const temCapa = Boolean(capa ?? fotoDestaque)

  return (
    <>
      <PerfilDaLoja className="mb-5" />
      <section className="rounded-[28px] bg-volt p-2 pb-6 sm:pb-8">
        {capa ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-[22px]">{capa}</div>
        ) : (
          fotoDestaque && (
            // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
            <img src={fotoDestaque} alt={preVenda.titulo} className="aspect-square w-full rounded-[22px] object-cover" />
          )
        )}
        <div className={cn('px-4 sm:px-6', temCapa ? 'pt-5' : 'pt-4 sm:pt-6')}>
          <p className="tipo-rotulo text-ink/70">{preVenda.grupoVip ? 'Pré-venda exclusiva · Grupo VIP' : `Pré-venda · ${nomeLoja}`}</p>
          <h1 className="tipo-h1 mt-3 text-balance">{preVenda.titulo}</h1>
          {preVenda.descricao && (
            <p className="mt-3 text-[17px] leading-7 whitespace-pre-line text-ink/80">
              <TextoWhatsapp texto={preVenda.descricao} />
            </p>
          )}
          {(preVenda.encerra_em || preVenda.previsao_entrega) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {preVenda.encerra_em && (
                <span className="tipo-dado inline-flex items-center gap-1.5 rounded-full bg-ink/10 px-3 py-1 text-[13px]">
                  <CalendarClock className="size-3.5" aria-hidden /> Encerra {formatarDataHora(preVenda.encerra_em)}
                </span>
              )}
              {preVenda.previsao_entrega && (
                <span className="tipo-dado inline-flex items-center gap-1.5 rounded-full bg-ink/10 px-3 py-1 text-[13px]">
                  <Truck className="size-3.5" aria-hidden /> Entrega prevista {formatarData(preVenda.previsao_entrega)}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {itens.length > 0 && (
        <ul className="mt-4 divide-y divide-linha rounded-[24px] border border-linha bg-superficie">
          {itens.map((item, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <Miniatura cerveja={item} className="size-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold">{item.nome}</p>
                <p className="truncate text-[13px] text-suave">{detalhesDa(item).join(' · ')}</p>
              </div>
              <p className="tipo-numero shrink-0 text-lg">{formatarMoeda(item.preco)}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-3 rounded-[20px] border border-linha bg-superficie p-4 text-[15px] leading-6">
        <Truck className="mt-0.5 size-5 shrink-0 text-volt-700" aria-hidden />
        <span>
          Frete fixo de <b>{formatarMoeda(freteVip)}</b> para os CEPs atendidos. Fora deles, a gente cota e te avisa no WhatsApp.
        </span>
      </p>

      <button type="button" onClick={aoComecar} tabIndex={aoComecar ? undefined : -1} className={classeBotaoGrande('escuro', 'mt-6 w-full')}>
        Começar <ArrowRight aria-hidden />
      </button>
      <p className="mt-3 text-center text-[13px] text-suave">Leva menos de 1 minuto.</p>
    </>
  )
}
