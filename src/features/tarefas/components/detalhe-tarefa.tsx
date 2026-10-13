'use client'

import { Ban, CircleCheck, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useOptimistic, useState, useTransition, type ReactNode } from 'react'

import { classesControle } from '@/components/form/fields'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { marcarAvisosLidos } from '@/features/notificacoes/actions'
import type { EstadoAcao } from '@/lib/acoes'
import { isoParaLocal } from '@/lib/datas'
import { formatarDataHora } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  atualizarTarefa,
  definirResponsavel,
  excluirTarefa,
  moverTarefa,
  registrarImpedimento,
  resolverImpedimento,
} from '../actions'
import { descreverPrazo, nomeCurto } from '../prazo'
import type { Pessoa, TarefaDetalhe } from '../queries'
import { HistoricoTarefa } from './historico-tarefa'
import { ImagensTarefa } from './imagens-tarefa'
import { Painel } from './painel'
import { EscolhaPrioridade, EscolhaStatus, SeletorPessoas } from './selos'

/** Roda uma Server Action dentro de uma transição; o erro aparece no topo do painel. */
export type Executar = (acao: () => Promise<EstadoAcao>, opcoes?: { antes?: () => void; depois?: (r: EstadoAcao) => void }) => void

/** Cartão aberto (painel lateral): tudo da tarefa editável no lugar + histórico. */
export function DetalheTarefa({
  tarefa,
  equipe,
  meuId,
  souAdmin,
  voltarHref,
}: {
  tarefa: TarefaDetalhe
  equipe: Pessoa[]
  meuId: string
  souAdmin: boolean
  voltarHref: string
}) {
  const router = useRouter()
  const avisar = useAvisos()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [status, mudarStatus] = useOptimistic(tarefa.status)
  const [prioridade, mudarPrioridade] = useOptimistic(tarefa.prioridade)
  const [responsaveis, mudarResponsaveis] = useOptimistic(tarefa.responsaveis.map((r) => r.id))

  // Abrir a tarefa conta como ter visto os avisos dela.
  useEffect(() => {
    if (tarefa.avisosNaoLidos > 0) void marcarAvisosLidos(tarefa.id)
  }, [tarefa.id, tarefa.avisosNaoLidos])

  const fechar = () => router.push(voltarHref, { scroll: false })

  const executar: Executar = (acao, opcoes) => {
    setErro(null)
    iniciar(async () => {
      opcoes?.antes?.()
      const r = await acao()
      if (r.ok === false) setErro(r.mensagem ?? 'Não foi possível salvar. Tente de novo.')
      else opcoes?.depois?.(r)
    })
  }

  // Quem saiu da equipe continua aparecendo enquanto for responsável (para poder ser tirado).
  const pessoas = [...equipe, ...tarefa.responsaveis.filter((r) => !equipe.some((p) => p.id === r.id))]
  const podeExcluir = souAdmin || tarefa.criado_por === meuId
  const prazo = descreverPrazo({ ...tarefa, status })

  return (
    <Painel rotulo={`Tarefa #${tarefa.numero}`} aoFechar={fechar}>
      <header className="flex items-center gap-2 border-b border-linha bg-superficie px-4 py-3 lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="tipo-dado text-[13px] font-semibold">Tarefa #{tarefa.numero}</p>
          <p className="truncate text-[12px] text-suave">
            Criada {tarefa.criado_por_nome ? `por ${nomeCurto(tarefa.criado_por_nome)} ` : ''}em {formatarDataHora(tarefa.criado_em)}
          </p>
        </div>
        {podeExcluir && (
          <Button
            variante="fantasma"
            tamanho="icone"
            title="Excluir tarefa"
            aria-label="Excluir tarefa"
            disabled={pendente}
            onClick={() => {
              if (!window.confirm(`Excluir a tarefa #${tarefa.numero}? O histórico e as imagens somem junto.`)) return
              executar(() => excluirTarefa(tarefa.id), {
                depois: (r) => {
                  avisar(r.mensagem ?? 'Tarefa excluída.')
                  fechar()
                },
              })
            }}
          >
            <Trash2 className="text-perigo" aria-hidden />
          </Button>
        )}
        <Button variante="fantasma" tamanho="icone" onClick={fechar} aria-label="Fechar">
          <X aria-hidden />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+32px)] lg:px-6">
        {erro && (
          <Alert tom="erro" className="sticky top-0 z-10 mb-4 shadow-cartao">
            {erro}
          </Alert>
        )}

        <Titulo key={tarefa.titulo} inicial={tarefa.titulo} aoSalvar={(titulo) => executar(() => atualizarTarefa(tarefa.id, { titulo }))} />

        <EscolhaStatus
          valor={status}
          className="mt-4"
          aoEscolher={(novo) => executar(() => moverTarefa(tarefa.id, novo), { antes: () => mudarStatus(novo) })}
        />

        {status !== 'concluida' && (
          <Impedimento
            key={tarefa.impedimento ?? ''}
            tarefa={tarefa}
            pendente={pendente}
            aoRegistrar={(motivo, depois) => executar(() => registrarImpedimento(tarefa.id, motivo), { depois })}
            aoResolver={(nota) => executar(() => resolverImpedimento(tarefa.id, nota))}
          />
        )}

        <div className="mt-6 grid gap-5">
          <Secao titulo="Prioridade">
            <EscolhaPrioridade
              valor={prioridade}
              aoEscolher={(nova) => executar(() => atualizarTarefa(tarefa.id, { prioridade: nova }), { antes: () => mudarPrioridade(nova) })}
            />
          </Secao>
          <Secao
            titulo="Prazo de entrega"
            extra={
              <span className={cn('text-[12px] font-semibold', prazo.tom === 'perigo' ? 'text-perigo' : prazo.tom === 'alerta' ? 'text-alerta' : 'text-suave')}>
                {prazo.texto}
              </span>
            }
          >
            <Prazo
              key={tarefa.prazo ?? ''}
              inicial={tarefa.prazo}
              pendente={pendente}
              aoSalvar={(valor) => executar(() => atualizarTarefa(tarefa.id, { prazo: valor }))}
            />
          </Secao>
        </div>

        <Secao titulo="Responsáveis" className="mt-6" extra={<span className="text-[12px] text-suave">Quem é marcado recebe um aviso</span>}>
          <SeletorPessoas
            pessoas={pessoas}
            selecionados={responsaveis}
            meuId={meuId}
            aoAlternar={(id, marcar) =>
              executar(() => definirResponsavel(tarefa.id, id, marcar), {
                antes: () => mudarResponsaveis((atual) => (marcar ? [...atual, id] : atual.filter((r) => r !== id))),
              })
            }
          />
        </Secao>

        <Secao titulo="Detalhes" className="mt-6">
          <Descricao
            key={tarefa.descricao ?? ''}
            inicial={tarefa.descricao ?? ''}
            pendente={pendente}
            aoSalvar={(descricao) => executar(() => atualizarTarefa(tarefa.id, { descricao }))}
          />
        </Secao>

        <Secao titulo={`Imagens${tarefa.imagens.length ? ` (${tarefa.imagens.length})` : ''}`} className="mt-6">
          <ImagensTarefa tarefaId={tarefa.id} imagens={tarefa.imagens} executar={executar} aoErro={setErro} />
        </Secao>

        <Secao titulo="Histórico" className="mt-8">
          <HistoricoTarefa tarefaId={tarefa.id} eventos={tarefa.historico} meuId={meuId} souAdmin={souAdmin} executar={executar} pendente={pendente} />
        </Secao>
      </div>
    </Painel>
  )
}

function Secao({ titulo, extra, className, children }: { titulo: string; extra?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="tipo-rotulo text-suave">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Titulo({ inicial, aoSalvar }: { inicial: string; aoSalvar: (titulo: string) => void }) {
  const [valor, setValor] = useState(inicial)
  return (
    <textarea
      value={valor}
      rows={2}
      maxLength={160}
      aria-label="Título da tarefa"
      onChange={(e) => setValor(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      onBlur={() => {
        const limpo = valor.trim()
        if (!limpo) setValor(inicial)
        else if (limpo !== inicial) aoSalvar(limpo)
      }}
      className="tipo-h3 -mx-2 block w-[calc(100%+16px)] resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-[20px] leading-7 font-semibold [field-sizing:content] outline-none hover:border-linha focus:border-ink focus:bg-superficie focus:ring-4 focus:ring-volt/25"
    />
  )
}

function Prazo({ inicial, pendente, aoSalvar }: { inicial: string | null; pendente: boolean; aoSalvar: (valor: string | null) => void }) {
  const original = isoParaLocal(inicial)
  const [valor, setValor] = useState(original)
  const mudou = valor !== original
  return (
    <div className="space-y-2">
      <input
        type="datetime-local"
        value={valor}
        aria-label="Prazo de entrega"
        onChange={(e) => setValor(e.target.value)}
        className={cn(classesControle, 'h-11 sm:max-w-80')}
      />
      {(mudou || inicial) && (
        <div className="flex gap-2">
          {mudou && (
            <Button tamanho="sm" variante="escuro" disabled={pendente} onClick={() => aoSalvar(valor || null)}>
              Salvar prazo
            </Button>
          )}
          {mudou ? (
            <Button tamanho="sm" variante="fantasma" onClick={() => setValor(original)}>
              Desfazer
            </Button>
          ) : (
            <Button tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => aoSalvar(null)}>
              Tirar prazo
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Descricao({
  inicial,
  pendente,
  aoSalvar,
}: {
  inicial: string
  pendente: boolean
  aoSalvar: (descricao: string) => void
}) {
  const [valor, setValor] = useState(inicial)
  const mudou = valor.trim() !== inicial.trim()
  return (
    <div className="space-y-2">
      <textarea
        value={valor}
        rows={4}
        maxLength={10000}
        aria-label="Detalhes da tarefa"
        placeholder="Contexto, passo a passo, links, o que é considerado pronto…"
        onChange={(e) => setValor(e.target.value)}
        className={cn(classesControle, 'min-h-28 py-2.5 leading-6 [field-sizing:content]')}
      />
      {mudou && (
        <div className="flex gap-2">
          <Button tamanho="sm" variante="escuro" disabled={pendente} onClick={() => aoSalvar(valor)}>
            Salvar detalhes
          </Button>
          <Button tamanho="sm" variante="fantasma" onClick={() => setValor(inicial)}>
            Desfazer
          </Button>
        </div>
      )}
    </div>
  )
}

function Impedimento({
  tarefa,
  pendente,
  aoRegistrar,
  aoResolver,
}: {
  tarefa: TarefaDetalhe
  pendente: boolean
  aoRegistrar: (motivo: string, depois: () => void) => void
  aoResolver: (nota: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [motivo, setMotivo] = useState(tarefa.impedimento ?? '')
  const [resolvendo, setResolvendo] = useState(false)
  const [nota, setNota] = useState('')

  if (editando) {
    return (
      <div className="mt-4 rounded-xl border border-perigo/30 bg-superficie p-4">
        <label htmlFor="motivo-impedimento" className="flex items-center gap-2 text-[14px] font-semibold text-perigo">
          <Ban className="size-4" aria-hidden /> O que está impedindo esta tarefa?
        </label>
        <textarea
          id="motivo-impedimento"
          value={motivo}
          autoFocus
          rows={3}
          maxLength={2000}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: Fornecedor sem estoque até dia 20; aguardando aprovação do orçamento…"
          className={cn(classesControle, 'mt-2 py-2.5 leading-6')}
        />
        <p className="mt-1.5 text-[12px] text-suave">Fica no histórico e avisa os responsáveis e quem criou a tarefa.</p>
        <div className="mt-3 flex gap-2">
          <Button tamanho="sm" variante="escuro" disabled={pendente || motivo.trim().length < 3} onClick={() => aoRegistrar(motivo, () => setEditando(false))}>
            Registrar impedimento
          </Button>
          <Button tamanho="sm" variante="fantasma" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  if (!tarefa.impedimento) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-linha-forte bg-superficie px-4 py-3 text-left hover:border-perigo/50 hover:bg-perigo-50/40"
      >
        <Ban className="size-4 shrink-0 text-perigo" aria-hidden />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">Registrar impedimento</span>
          <span className="block text-[12px] text-suave">Algo travou? Conte o motivo para todo mundo saber por que parou.</span>
        </span>
      </button>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-perigo/30 bg-perigo-50 p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-perigo">
        <Ban className="size-4" aria-hidden /> Tarefa impedida
      </p>
      <p className="mt-1 text-[14px] whitespace-pre-wrap text-ink">{tarefa.impedimento}</p>
      {tarefa.impedida_em && (
        <p className="mt-1 text-[12px] text-suave">
          Registrado {tarefa.impedida_por_nome ? `por ${nomeCurto(tarefa.impedida_por_nome)} ` : ''}em {formatarDataHora(tarefa.impedida_em)}
        </p>
      )}
      {resolvendo ? (
        <div className="mt-3">
          <textarea
            value={nota}
            autoFocus
            rows={2}
            maxLength={4000}
            aria-label="Como foi resolvido"
            onChange={(e) => setNota(e.target.value)}
            placeholder="Como foi resolvido? (opcional — entra no histórico)"
            className={cn(classesControle, 'py-2.5 leading-6')}
          />
          <div className="mt-2 flex gap-2">
            <Button tamanho="sm" variante="escuro" disabled={pendente} onClick={() => aoResolver(nota)}>
              <CircleCheck aria-hidden /> Confirmar
            </Button>
            <Button tamanho="sm" variante="fantasma" onClick={() => setResolvendo(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button tamanho="sm" variante="secundario" onClick={() => setResolvendo(true)}>
            <CircleCheck aria-hidden /> Resolver impedimento
          </Button>
          <Button tamanho="sm" variante="fantasma" onClick={() => setEditando(true)}>
            Atualizar motivo
          </Button>
        </div>
      )}
    </div>
  )
}
