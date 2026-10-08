import { Inbox } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Ponto } from '@/components/ui/badge'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { diasDesde } from '@/lib/datas'
import { formatarDataCurta, formatarHora, formatarWhatsapp } from '@/lib/format'
import { STATUS_ATENDIMENTO } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

import type { AbaAtendimento, ItemCaixaEntrada } from '../queries'
import { EtiquetaChip } from './etiqueta'
import { FotoContato } from './foto-contato'
import { BotaoTema } from './tema-atendimento'

const ROTULOS_ABAS: Record<AbaAtendimento, string> = {
  fila: 'Fila',
  meus: 'Meus',
  abertos: 'Abertos',
  resolvidos: 'Resolvidos',
}

const VAZIO: Record<AbaAtendimento, string> = {
  fila: 'Ninguém esperando. Quando um cliente chamar, ele aparece aqui.',
  meus: 'Você não tem atendimentos em andamento.',
  abertos: 'Nenhum atendimento aberto.',
  resolvidos: 'Nenhum atendimento resolvido ainda.',
}

/** 14:32 (hoje) · ontem · 03 out */
function quando(iso: string | null) {
  if (!iso) return ''
  const dias = diasDesde(iso)
  if (dias === 0) return formatarHora(iso)
  if (dias === 1) return 'ontem'
  return formatarDataCurta(iso)
}

/** "*Ana:* oi" → "Ana: oi" (a prévia não mostra os marcadores do WhatsApp). */
function semFormatacao(texto: string) {
  return texto.replace(/([*_~])([^*_~\n]+)\1/g, '$2')
}

export function hrefConversa(aba: AbaAtendimento, busca: string | undefined, id?: string) {
  const p = new URLSearchParams({ aba })
  if (busca) p.set('q', busca)
  if (id) p.set('id', id)
  return `/atendimento?${p}`
}

export function ListaConversas({
  itens,
  aba,
  busca,
  selecionado,
  contagens,
  meuId,
  avisos,
}: {
  itens: ItemCaixaEntrada[]
  aba: AbaAtendimento
  busca?: string
  selecionado?: string
  contagens: { fila: number; meus: number; abertos: number }
  meuId: string
  avisos: ReactNode
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-linha p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h1 className="tipo-h3">Atendimento</h1>
          <div className="flex items-center gap-1">
            {avisos}
            <BotaoTema />
          </div>
        </div>
        <nav className="flex gap-0.5 rounded-xl bg-ink/[0.06] p-1" aria-label="Filas de atendimento">
          {(Object.keys(ROTULOS_ABAS) as AbaAtendimento[]).map((chave) => {
            const ativa = chave === aba
            const n = chave === 'resolvidos' ? null : contagens[chave]
            return (
              <Link
                key={chave}
                href={hrefConversa(chave, busca)}
                aria-current={ativa ? 'page' : undefined}
                className={cn(
                  'inline-flex min-w-0 flex-auto items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors',
                  ativa ? 'bg-superficie text-ink shadow-sm' : 'text-suave hover:text-ink',
                )}
              >
                {ROTULOS_ABAS[chave]}
                {n ? (
                  <span
                    className={cn(
                      'tipo-dado grid h-4 min-w-4 shrink-0 place-items-center rounded-[5px] px-1 text-[10px] leading-none',
                      chave === 'fila' ? 'bg-alerta text-white' : 'bg-papel text-suave',
                    )}
                  >
                    {n}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>
        <FilterBar caminho="/atendimento">
          <input type="hidden" name="aba" value={aba} />
          <SearchField valor={busca} placeholder="Buscar nome, número ou etiqueta" className="min-w-0" />
        </FilterBar>
      </div>

      {itens.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-volt-50 text-volt-700">
            <Inbox className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-suave">{busca ? 'Nenhuma conversa encontrada para essa busca.' : VAZIO[aba]}</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-linha overflow-y-auto overscroll-contain">
          {itens.map((item) => {
            const ativo = item.id === selecionado
            const nome = item.contato_nome || formatarWhatsapp(item.whatsapp) || 'Contato do WhatsApp'
            const status = item.status ? STATUS_ATENDIMENTO[item.status] : null
            const naoLidas = item.nao_lidas ?? 0
            const meu = item.responsavel_id === meuId
            return (
              <li key={item.id}>
                <Link
                  href={hrefConversa(aba, busca, item.id ?? undefined)}
                  aria-current={ativo ? 'true' : undefined}
                  className={cn(
                    'flex gap-3 px-3 py-3 transition-colors',
                    ativo ? 'bg-volt-50' : 'hover:bg-papel',
                  )}
                >
                  <FotoContato nome={nome} foto={item.contato_foto} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate text-[14px]', naoLidas ? 'font-bold' : 'font-semibold')}>{nome}</p>
                      <span className={cn('tipo-dado shrink-0 text-[11px]', naoLidas ? 'font-semibold text-volt-700' : 'text-sutil')}>
                        {quando(item.ultima_mensagem_em)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('truncate text-[13px]', naoLidas ? 'text-ink' : 'text-suave')}>
                        {item.ultima_mensagem_direcao === 'saida' && <span className="text-sutil">Você: </span>}
                        {item.ultima_mensagem_previa ? semFormatacao(item.ultima_mensagem_previa) : 'Sem mensagens'}
                      </p>
                      {naoLidas > 0 && (
                        <span className="tipo-dado grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-volt px-1.5 text-[11px] text-ink escuro:text-ink-900">
                          {naoLidas}
                        </span>
                      )}
                    </div>
                    {item.etiquetas.length > 0 && (
                      <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                        {item.etiquetas.map((e) => (
                          <EtiquetaChip key={e.id} etiqueta={e} />
                        ))}
                      </div>
                    )}
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-sutil">
                      {status && <Ponto tom={status.tom} />}
                      <span className="truncate">
                        {status?.rotulo}
                        {item.responsavel_nome ? ` · ${meu ? 'você' : item.responsavel_nome}` : ''}
                      </span>
                      <span className="tipo-dado ml-auto shrink-0">#{item.numero}</span>
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
