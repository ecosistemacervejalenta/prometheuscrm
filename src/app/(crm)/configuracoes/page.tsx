import type { Metadata } from 'next'
import { ChevronRight, CircleAlert } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { GRUPOS_CONFIGURACOES, type ChaveSecao } from '@/features/configuracoes/navegacao'
import { secoesQuePedemAtencao, situacaoDaSecao } from '@/features/configuracoes/resumo'
import { exigirEquipe } from '@/lib/auth'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Configurações' }

/** Etiqueta com a situação da seção. Carrega depois da página (algumas consultam serviços externos). */
async function Situacao({ chave }: { chave: ChaveSecao }) {
  const situacao = await situacaoDaSecao(chave)
  if (!situacao) return null
  return (
    <Badge tom={situacao.tom} ponto={situacao.ponto} className="max-w-[46vw] sm:max-w-none">
      <span className="min-w-0 truncate">{situacao.rotulo}</span>
    </Badge>
  )
}

/** O que precisa de alguém agora, com atalho direto para a seção. */
async function PrecisaDeAtencao() {
  const pendencias = await secoesQuePedemAtencao()
  if (pendencias.length === 0) return null

  return (
    <section aria-labelledby="titulo-atencao" className="mb-6 rounded-cartao border border-alerta/30 bg-superficie shadow-cartao">
      <h2 id="titulo-atencao" className="flex items-center gap-2 border-b border-alerta/20 bg-alerta-50 px-4 py-2.5 text-[13px] font-semibold text-alerta lg:px-5">
        <CircleAlert className="size-4" aria-hidden />
        Precisa de atenção
      </h2>
      <ul className="divide-y divide-linha">
        {pendencias.map((p) => (
          <li key={p.chave}>
            <Link href={p.href} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-papel/60 active:bg-papel lg:px-5">
              <span className="min-w-0 flex-1">{p.atencao}</span>
              <span className="shrink-0 font-semibold text-volt-700">{p.rotulo}</span>
              <ChevronRight className="-mr-1 size-4 shrink-0 text-sutil" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function PaginaConfiguracoes({ searchParams }: PageProps<'/configuracoes'>) {
  await exigirEquipe()
  const erro = param((await searchParams).erro)

  return (
    <div className="max-w-3xl">
      <PageHeader
        titulo={
          <>
            <span className="xl:hidden">Configurações</span>
            <span className="hidden xl:inline">Visão geral</span>
          </>
        }
        descricao="Cada assunto tem a própria página. Escolha o que você quer ajustar."
      />

      {erro === 'apenas-admin' && (
        <Alert tom="alerta" className="mb-6">
          Esta área é exclusiva de administradores.
        </Alert>
      )}

      <Suspense fallback={null}>
        <PrecisaDeAtencao />
      </Suspense>

      <div className="space-y-6">
        {GRUPOS_CONFIGURACOES.map((grupo) => (
          <section key={grupo.titulo} aria-label={grupo.titulo}>
            <h2 className="tipo-rotulo mb-2 px-1 text-suave">{grupo.titulo}</h2>
            <ul className="divide-y divide-linha overflow-hidden rounded-cartao border border-linha bg-superficie shadow-cartao">
              {grupo.secoes.map((s) => {
                const Icone = s.icone
                return (
                  <li key={s.chave}>
                    <Link
                      href={s.href}
                      className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-papel/60 active:bg-papel lg:px-5"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-papel text-ink ring-1 ring-linha ring-inset" aria-hidden>
                        <Icone className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] leading-5 font-semibold">{s.rotulo}</span>
                        <span className="mt-0.5 hidden truncate text-[13px] leading-[18px] text-suave sm:block">{s.descricao}</span>
                      </span>
                      <Suspense fallback={<span className="h-6 w-20 animate-pulse rounded-full bg-linha/70" aria-hidden />}>
                        <Situacao chave={s.chave} />
                      </Suspense>
                      <ChevronRight className="-mr-1 size-4 shrink-0 text-sutil" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
