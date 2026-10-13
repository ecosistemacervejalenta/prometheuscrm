import type { Metadata } from 'next'
import Link from 'next/link'

import { Alert } from '@/components/ui/alert'
import { FilterBar, FilterSelect, SearchField } from '@/components/ui/filter-bar'
import { PageHeader } from '@/components/ui/page-header'
import { QuadroAoVivo } from '@/features/tarefas/components/ao-vivo'
import { DetalheTarefa } from '@/features/tarefas/components/detalhe-tarefa'
import { NovaTarefa } from '@/features/tarefas/components/nova-tarefa'
import { Quadro } from '@/features/tarefas/components/quadro'
import {
  LIMITE_CONCLUIDAS,
  listarEquipe,
  listarQuadro,
  obterTarefa,
  resumoTarefas,
  type FiltrosTarefas,
} from '@/features/tarefas/queries'
import { PRIORIDADES, SITUACOES } from '@/features/tarefas/schema'
import { exigirEquipe } from '@/lib/auth'
import { formatarNumero } from '@/lib/format'
import { PRIORIDADE_TAREFA } from '@/lib/rotulos'
import { cn, param } from '@/lib/utils'
import { uuid } from '@/lib/validacao'

export const metadata: Metadata = { title: 'Tarefas' }

export default async function PaginaTarefas({ searchParams }: PageProps<'/tarefas'>) {
  const { perfil } = await exigirEquipe()
  const busca = await searchParams
  const resp = param(busca.resp)
  const idParam = param(busca.id)
  const id = idParam && uuid.safeParse(idParam).success ? idParam : undefined

  const filtros: FiltrosTarefas = {
    busca: param(busca.q)?.slice(0, 100),
    responsavel: resp === 'eu' || (resp && uuid.safeParse(resp).success) ? resp : undefined,
    prioridade: PRIORIDADES.find((p) => p === param(busca.prioridade)),
    situacao: SITUACOES.find((s) => s === param(busca.situacao)),
  }
  const consulta = new URLSearchParams(
    Object.entries({ q: filtros.busca, resp: filtros.responsavel, prioridade: filtros.prioridade, situacao: filtros.situacao }).filter(
      (par): par is [string, string] => Boolean(par[1]),
    ),
  ).toString()
  const hrefCom = (mudanca: Record<string, string | undefined>) => {
    const params = new URLSearchParams(consulta)
    for (const [chave, valor] of Object.entries(mudanca)) {
      if (valor) params.set(chave, valor)
      else params.delete(chave)
    }
    const texto = params.toString()
    return texto ? `/tarefas?${texto}` : '/tarefas'
  }

  const [tarefas, resumo, equipe, detalhe] = await Promise.all([
    listarQuadro(filtros),
    resumoTarefas(),
    listarEquipe(),
    id ? obterTarefa(id) : null,
  ])

  const atalhos = [
    { chave: 'resp', valor: 'eu', rotulo: 'Minhas', total: resumo.minhas, ativo: filtros.responsavel === 'eu', alerta: false },
    { chave: 'situacao', valor: 'atrasadas', rotulo: 'Atrasadas', total: resumo.atrasadas, ativo: filtros.situacao === 'atrasadas', alerta: true },
    { chave: 'situacao', valor: 'impedidas', rotulo: 'Impedidas', total: resumo.impedidas, ativo: filtros.situacao === 'impedidas', alerta: true },
    { chave: 'situacao', valor: 'sem_prazo', rotulo: 'Sem prazo', total: resumo.semPrazo, ativo: filtros.situacao === 'sem_prazo', alerta: false },
  ]

  return (
    <>
      <PageHeader
        contexto={`Equipe · ${formatarNumero(resumo.abertas)} em aberto · ${formatarNumero(resumo.concluidasSemana)} entregues em 7 dias`}
        titulo="Tarefas"
        descricao="Demandas internas com responsável, prazo, impedimentos e histórico."
        acoes={<NovaTarefa equipe={equipe} meuId={perfil.id} />}
      />

      {idParam && !detalhe && (
        <Alert tom="alerta" className="mb-4">
          Esta tarefa não existe mais — pode ter sido excluída.
        </Alert>
      )}

      <nav aria-label="Atalhos" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {atalhos.map((a) => (
          <Link
            key={a.valor}
            href={hrefCom({ [a.chave]: a.ativo ? undefined : a.valor })}
            aria-current={a.ativo ? 'true' : undefined}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
              a.ativo ? 'border-ink bg-ink text-white' : 'border-linha bg-superficie text-ink hover:border-linha-forte',
            )}
          >
            {a.rotulo}
            <span
              className={cn(
                'tipo-dado text-[12px]',
                a.ativo ? 'text-white/70' : a.alerta && a.total > 0 ? 'font-semibold text-perigo' : 'text-suave',
              )}
            >
              {formatarNumero(a.total)}
            </span>
          </Link>
        ))}
      </nav>

      <FilterBar caminho="/tarefas" className="mb-4">
        <SearchField valor={filtros.busca} placeholder="Buscar por título, número, detalhe ou pessoa" />
        <FilterSelect
          name="resp"
          rotulo="Todos os responsáveis"
          valor={filtros.responsavel}
          opcoes={[{ valor: 'eu', rotulo: 'Minhas tarefas' }, ...equipe.map((p) => ({ valor: p.id, rotulo: p.nome }))]}
        />
        <FilterSelect
          name="prioridade"
          rotulo="Todas as prioridades"
          valor={filtros.prioridade}
          opcoes={[...PRIORIDADES].reverse().map((p) => ({ valor: p, rotulo: PRIORIDADE_TAREFA[p].rotulo }))}
        />
        {filtros.situacao && <input type="hidden" name="situacao" value={filtros.situacao} />}
      </FilterBar>

      <Quadro tarefas={tarefas} consulta={consulta} limiteConcluidas={LIMITE_CONCLUIDAS} />

      {detalhe && (
        <DetalheTarefa
          key={detalhe.id}
          tarefa={detalhe}
          equipe={equipe}
          meuId={perfil.id}
          souAdmin={perfil.papel === 'admin'}
          voltarHref={consulta ? `/tarefas?${consulta}` : '/tarefas'}
        />
      )}
      <QuadroAoVivo />
    </>
  )
}
