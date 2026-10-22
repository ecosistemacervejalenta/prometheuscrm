'use client'

import { ArrowRight, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { Icone } from '@/components/marca/marca'
import { Button } from '@/components/ui/button'
import { FUSO } from '@/lib/datas'

import { abrirFraseDoDia } from '../actions'
import type { Frase } from '../frases'

/** Só computador: tela larga e mouse (celular e tablet não recebem o pop-up). */
const DESKTOP = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'
/** Intervalo mínimo entre consultas ao servidor (ao navegar ou voltar para a aba). */
const ESPERA = 10 * 60_000

/**
 * Pop-up motivacional: uma frase por dia, uma vez para cada login em cada IP.
 * Confere ao abrir o CRM, ao trocar de tela e ao voltar para a aba — assim quem
 * muda de rede (ou deixa a aba aberta de um dia para o outro) também recebe.
 */
export function FraseDoDia({ nome }: { nome: string }) {
  const janela = useRef<HTMLDialogElement>(null)
  const ultimaConsulta = useRef(0)
  const [frase, setFrase] = useState<Frase | null>(null)
  const pathname = usePathname()

  const conferir = useEffectEvent(() => {
    if (document.visibilityState !== 'visible' || !window.matchMedia(DESKTOP).matches) return
    if (janela.current?.open || Date.now() - ultimaConsulta.current < ESPERA) return
    ultimaConsulta.current = Date.now()
    abrirFraseDoDia()
      .then((nova) => nova && setFrase(nova))
      .catch(() => {})
  })

  useEffect(() => {
    conferir()
  }, [pathname])

  useEffect(() => {
    const aoVoltar = () => conferir()
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [])

  useEffect(() => {
    if (frase && !janela.current?.open) janela.current?.showModal()
  }, [frase])

  const fechar = () => janela.current?.close()
  const agora = new Date()
  const hora = agora.getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const data = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(agora)
  const iniciais = frase?.autor
    .split(' ')
    .map((parte) => parte[0])
    .slice(0, 2)
    .join('')

  return (
    <dialog
      ref={janela}
      onClose={() => setFrase(null)}
      onClick={(e) => e.target === e.currentTarget && fechar()}
      aria-labelledby="frase-do-dia-titulo"
      className="animar-passo m-auto w-[min(680px,calc(100vw-48px))] overflow-hidden rounded-cartao bg-ink-900 text-white shadow-flutuante ring-1 ring-white/10 backdrop:bg-ink/60 backdrop:backdrop-blur-[2px]"
    >
      {frase && (
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute -top-36 -right-28 size-80 rounded-full bg-volt/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-44 -left-36 size-80 rounded-full bg-volt/10 blur-3xl" />

          <div className="relative px-10 pt-8 pb-9">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Icone tamanho={32} />
                <div>
                  <h2 id="frase-do-dia-titulo" className="tipo-rotulo text-volt">
                    Frase do dia
                  </h2>
                  <p className="text-[13px] text-white/50 first-letter:uppercase">{data}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={fechar}
                className="grid size-9 cursor-pointer place-items-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-4"
              >
                <X aria-hidden />
              </button>
            </div>

            <p className="mt-9 text-[15px] text-white/60">
              {saudacao}
              {nome ? `, ${nome}` : ''}. Uma ideia para levar no dia:
            </p>

            <figure className="mt-3">
              <span aria-hidden className="block h-11 font-display text-[96px] leading-none font-extrabold text-volt">
                “
              </span>
              <blockquote className="tipo-h2 text-balance text-white">{frase.texto}</blockquote>
              <figcaption className="mt-8 flex items-center gap-4 border-t border-white/10 pt-6">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 font-display text-[15px] font-bold text-volt">
                  {iniciais}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{frase.autor}</p>
                  <p className="text-[13px] text-white/50">
                    <span className="tipo-rotulo text-white/75">{frase.empresa}</span>
                    <span className="mx-2 text-white/25">·</span>
                    {frase.valor}
                  </p>
                </div>
              </figcaption>
            </figure>
          </div>

          <div className="relative flex items-center justify-between gap-4 border-t border-white/10 bg-black/25 px-10 py-5">
            <p className="text-[13px] text-white/45">Amanhã tem outra.</p>
            <Button variante="primario" autoFocus onClick={fechar}>
              Bora trabalhar
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
