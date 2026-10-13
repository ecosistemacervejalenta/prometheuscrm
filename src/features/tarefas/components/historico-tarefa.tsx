'use client'

import {
  ArrowRight,
  Ban,
  CalendarClock,
  CircleCheck,
  Flag,
  ImageMinus,
  ImagePlus,
  MessageSquare,
  Pencil,
  Sparkles,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { formatarDataHora } from '@/lib/format'
import { PRIORIDADE_TAREFA, STATUS_TAREFA } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { PrioridadeTarefa, StatusTarefa } from '@/types'

import { apagarComentario, comentarTarefa } from '../actions'
import { nomeCurto } from '../prazo'
import type { EventoHistorico } from '../queries'
import type { Executar } from './detalhe-tarefa'

type Linha = { evento: EventoHistorico; quantidade: number }

/** Várias imagens enviadas de uma vez pela mesma pessoa viram uma linha só. */
function agrupar(eventos: EventoHistorico[]): Linha[] {
  const linhas: Linha[] = []
  for (const e of eventos) {
    const anterior = linhas.at(-1)
    if (
      anterior &&
      e.tipo === 'anexo_adicionado' &&
      anterior.evento.tipo === 'anexo_adicionado' &&
      anterior.evento.autor_id === e.autor_id &&
      Math.abs(Date.parse(anterior.evento.criado_em) - Date.parse(e.criado_em)) < 2 * 60_000
    ) {
      anterior.quantidade++
    } else {
      linhas.push({ evento: e, quantidade: 1 })
    }
  }
  return linhas
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const status = (v: unknown) => STATUS_TAREFA[v as StatusTarefa]?.rotulo ?? texto(v)
const prioridade = (v: unknown) => PRIORIDADE_TAREFA[v as PrioridadeTarefa]?.rotulo ?? texto(v)
const quando = (v: unknown) => (typeof v === 'string' && v ? formatarDataHora(v) : null)

/** Ícone, cor e frase de cada registro do histórico. */
function descrever({ evento: e, quantidade }: Linha): { icone: LucideIcon; cor: string; frase: ReactNode } {
  const quem = <strong className="font-semibold">{e.autor_nome ? nomeCurto(e.autor_nome) : 'Alguém'}</strong>
  const d = e.dados
  switch (e.tipo) {
    case 'criada':
      return { icone: Sparkles, cor: 'bg-volt text-ink', frase: <>{quem} criou a tarefa</> }
    case 'status':
      return {
        icone: d.para === 'concluida' ? CircleCheck : ArrowRight,
        cor: d.para === 'concluida' ? 'bg-sucesso text-white' : 'bg-shopify text-white',
        frase: (
          <>
            {quem} moveu de <strong className="font-semibold">{status(d.de)}</strong> para <strong className="font-semibold">{status(d.para)}</strong>
          </>
        ),
      }
    case 'prioridade':
      return {
        icone: Flag,
        cor: 'bg-alerta text-white',
        frase: (
          <>
            {quem} mudou a prioridade de {prioridade(d.de)} para <strong className="font-semibold">{prioridade(d.para)}</strong>
          </>
        ),
      }
    case 'prazo': {
      const de = quando(d.de)
      const para = quando(d.para)
      return {
        icone: CalendarClock,
        cor: 'bg-app text-white',
        frase: !para ? (
          <>
            {quem} tirou o prazo{de ? ` (era ${de})` : ''}
          </>
        ) : de ? (
          <>
            {quem} mudou o prazo de {de} para <strong className="font-semibold">{para}</strong>
          </>
        ) : (
          <>
            {quem} definiu o prazo para <strong className="font-semibold">{para}</strong>
          </>
        ),
      }
    }
    case 'editada': {
      const campos = Array.isArray(d.campos) ? d.campos : []
      const oque = campos.length > 1 ? 'o título e os detalhes' : campos[0] === 'titulo' ? 'o título' : 'os detalhes'
      return {
        icone: Pencil,
        cor: 'bg-papel text-suave ring-1 ring-linha',
        frase: (
          <>
            {quem} editou {oque}
            {d.titulo_anterior ? <span className="text-suave"> (antes: “{texto(d.titulo_anterior)}”)</span> : null}
          </>
        ),
      }
    }
    case 'responsavel_adicionado':
      return {
        icone: UserPlus,
        cor: 'bg-ink text-white',
        frase:
          d.perfil_id === e.autor_id ? (
            <>{quem} entrou como responsável</>
          ) : (
            <>
              {quem} marcou <strong className="font-semibold">{nomeCurto(texto(d.nome)) || 'alguém'}</strong> como responsável
            </>
          ),
      }
    case 'responsavel_removido':
      return {
        icone: UserMinus,
        cor: 'bg-papel text-suave ring-1 ring-linha',
        frase:
          d.perfil_id === e.autor_id ? (
            <>{quem} saiu dos responsáveis</>
          ) : (
            <>
              {quem} tirou <strong className="font-semibold">{nomeCurto(texto(d.nome)) || 'alguém'}</strong> dos responsáveis
            </>
          ),
      }
    case 'anexo_adicionado':
      return {
        icone: ImagePlus,
        cor: 'bg-vip text-ink',
        frase: quantidade > 1 ? <>{quem} anexou {quantidade} imagens</> : <>{quem} anexou a imagem “{texto(d.nome)}”</>,
      }
    case 'anexo_removido':
      return { icone: ImageMinus, cor: 'bg-papel text-suave ring-1 ring-linha', frase: <>{quem} removeu a imagem “{texto(d.nome)}”</> }
    case 'impedimento':
      return { icone: Ban, cor: 'bg-perigo text-white', frase: <>{quem} registrou um impedimento</> }
    case 'impedimento_resolvido':
      return {
        icone: CircleCheck,
        cor: 'bg-sucesso text-white',
        frase: (
          <>
            {quem} resolveu o impedimento
            {d.motivo ? <span className="text-suave"> (era: “{texto(d.motivo)}”)</span> : null}
          </>
        ),
      }
    default:
      return { icone: MessageSquare, cor: 'bg-ink text-white', frase: <>{quem} comentou</> }
  }
}

/** Comentários da equipe + tudo o que mudou na tarefa, do mais recente para o mais antigo. */
export function HistoricoTarefa({
  tarefaId,
  eventos,
  meuId,
  souAdmin,
  executar,
  pendente,
}: {
  tarefaId: string
  eventos: EventoHistorico[]
  meuId: string
  souAdmin: boolean
  executar: Executar
  pendente: boolean
}) {
  const [comentario, setComentario] = useState('')

  const enviar = () => {
    if (!comentario.trim()) return
    executar(() => comentarTarefa(tarefaId, comentario), { depois: () => setComentario('') })
  }

  return (
    <div>
      <div className="rounded-xl border border-linha bg-superficie p-3 focus-within:border-ink focus-within:ring-4 focus-within:ring-volt/25">
        <textarea
          value={comentario}
          rows={2}
          maxLength={4000}
          aria-label="Escrever atualização"
          placeholder="Escreva uma atualização: o que andou, o que falta, combinados…"
          onChange={(e) => setComentario(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              enviar()
            }
          }}
          className="block w-full resize-none bg-transparent text-[15px] leading-6 outline-none placeholder:text-sutil [field-sizing:content] min-h-12"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="hidden text-[12px] text-sutil sm:inline">Ctrl + Enter envia</span>
          <Button tamanho="sm" variante="escuro" className="ml-auto" disabled={pendente || !comentario.trim()} onClick={enviar}>
            <MessageSquare aria-hidden /> Comentar
          </Button>
        </div>
      </div>

      <ol className="relative mt-5 space-y-4 before:absolute before:top-3 before:bottom-3 before:left-[13px] before:w-px before:bg-linha">
        {agrupar(eventos).map((linha) => {
          const { evento: e } = linha
          const { icone: Icone, cor, frase } = descrever(linha)
          const comentarioProprio = e.tipo === 'comentario' && (e.autor_id === meuId || souAdmin)
          return (
            <li key={e.id} className="relative flex gap-3">
              <span className={cn('relative z-[1] grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-papel', cor)} aria-hidden>
                <Icone className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[14px] leading-5">{frase}</p>
                {e.texto && (
                  <p
                    className={cn(
                      'mt-1.5 rounded-xl px-3 py-2 text-[14px] leading-6 whitespace-pre-wrap break-words',
                      e.tipo === 'impedimento' ? 'bg-perigo-50 text-ink' : 'border border-linha bg-superficie',
                    )}
                  >
                    {e.texto}
                  </p>
                )}
                <p className="tipo-dado mt-1 flex items-center gap-2 text-[11px] text-sutil">
                  {formatarDataHora(e.criado_em)}
                  {comentarioProprio && (
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => window.confirm('Apagar este comentário?') && executar(() => apagarComentario(e.id))}
                      className="font-sans font-semibold text-sutil hover:text-perigo"
                    >
                      Apagar
                    </button>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
