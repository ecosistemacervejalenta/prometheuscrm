import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CheckCheck, Pencil, Users } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, FilterSelect, SearchField } from '@/components/ui/filter-bar'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { finalizarListaIncompleta } from '@/features/leads/actions'
import { ResumoDdd } from '@/features/leads/components/resumo-ddd'
import { TabelaLeads } from '@/features/leads/components/tabela-leads'
import { dddValido, opcoesDdd, resumirDdds } from '@/features/leads/ddd'
import { contarDdds, LEADS_POR_PAGINA, listarLeads, obterLista, type FiltroLeads } from '@/features/leads/queries'
import { formatarDataCurta, formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Lista de leads' }

const FILTROS: Array<{ valor: FiltroLeads; rotulo: string }> = [
  { valor: 'com_whatsapp', rotulo: 'Com WhatsApp' },
  { valor: 'sem_whatsapp', rotulo: 'Sem WhatsApp' },
  { valor: 'clientes', rotulo: 'Já são clientes' },
  { valor: 'nao_clientes', rotulo: 'Ainda não são clientes' },
]

export default async function PaginaListaLeads({ params, searchParams }: PageProps<'/leads/listas/[id]'>) {
  const { id } = await params
  const busca = await searchParams
  const q = param(busca.q)
  const filtroBruto = param(busca.filtro)
  const filtro = FILTROS.some((f) => f.valor === filtroBruto) ? (filtroBruto as FiltroLeads) : undefined
  const ddd = dddValido(param(busca.ddd))
  const pagina = Math.max(1, Number(param(busca.pagina) ?? 1) || 1)

  const lista = await obterLista(id)
  if (!lista) notFound()
  const [{ leads, total }, contagem] = await Promise.all([listarLeads(id, { busca: q, filtro, ddd, pagina }), contarDdds({ listaId: id })])
  const filtrando = Boolean(q || filtro || ddd)
  const pasta = lista.leads_pastas

  return (
    <>
      <PageHeader
        voltar={pasta ? { href: `/leads/pastas/${pasta.id}`, rotulo: pasta.nome } : { href: '/leads', rotulo: 'Banco de Leads' }}
        contexto={[lista.origem, lista.arquivo_nome, `importada em ${formatarDataCurta(lista.criado_em)}`].filter(Boolean).join(' · ')}
        titulo={lista.nome}
        acoes={
          <ButtonLink href={`/leads/listas/${id}/editar`}>
            <Pencil /> Editar lista
          </ButtonLink>
        }
      />

      {lista.status === 'importando' && (
        <Alert tom="alerta" titulo="Importação incompleta" className="mb-5">
          O envio desta lista foi interrompido. Você pode finalizar com os leads que chegaram ou excluir a lista e importar de novo.
          <div className="mt-2">
            <ActionButton acao={finalizarListaIncompleta.bind(null, id)}>
              <CheckCheck /> Finalizar com o que chegou
            </ActionButton>
          </div>
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-2.5 lg:mb-6 lg:grid-cols-4 lg:gap-3">
        <Kpi rotulo="Leads" valor={formatarNumero(lista.total)} detalhe={`${lista.colunas.length} coluna(s)`} />
        <Kpi
          rotulo="Com WhatsApp"
          valor={formatarNumero(lista.com_whatsapp)}
          detalhe={lista.total ? `${Math.round((lista.com_whatsapp / lista.total) * 100)}% da lista` : '—'}
          tendencia="positiva"
        />
        <Kpi rotulo="Já são clientes" valor={formatarNumero(lista.jaClientes)} detalhe="mesmo WhatsApp no CRM" />
        <Kpi rotulo="Sem WhatsApp" valor={formatarNumero(lista.total - lista.com_whatsapp)} detalhe="ficam fora dos disparos" />
      </div>

      <Card>
        <div className="border-b border-linha p-4">
          <FilterBar caminho={`/leads/listas/${id}`}>
            <SearchField valor={q} placeholder="Buscar em qualquer coluna (nome, número, cidade...)" />
            <FilterSelect name="filtro" valor={filtro} rotulo="Todos os leads" opcoes={FILTROS} />
            <FilterSelect name="ddd" valor={ddd} rotulo="Todos os DDDs" opcoes={opcoesDdd(resumirDdds(contagem).porDdd)} />
          </FilterBar>
        </div>
        <div className="border-b border-linha">
          <ResumoDdd contagem={contagem} ddd={ddd} onde="lista" nome={lista.nome} listaId={id} />
        </div>
        {leads.length === 0 ? (
          <EmptyState
            icone={Users}
            titulo={filtrando ? 'Nenhum lead encontrado' : 'Lista vazia'}
            descricao={filtrando ? 'Tente outra busca ou filtro.' : 'Esta lista não tem leads.'}
          />
        ) : (
          <TabelaLeads
            leads={leads}
            colunas={lista.colunas}
            mapa={{ nome: lista.coluna_nome, whatsapp: lista.coluna_whatsapp, email: lista.coluna_email }}
          />
        )}
        <div className="border-t border-linha px-4 py-3 lg:px-5">
          <Pagination pagina={pagina} porPagina={LEADS_POR_PAGINA} total={total} caminho={`/leads/listas/${id}`} parametros={{ q, filtro, ddd }} />
          {total > 0 && (
            <p className="text-[12px] text-suave">
              {formatarNumero(total)} lead(s){filtrando ? ' encontrados' : ''}
            </p>
          )}
        </div>
      </Card>
    </>
  )
}
