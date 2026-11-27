import {
  ArrowDownRight,
  BellRing,
  CircleCheck,
  ArrowUpRight,
  CircleAlert,
  ClipboardCheck,
  Info,
  PackagePlus,
  PackageX,
  Pencil,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

import { formatarData, formatarDataHora, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { MovimentoDoLote, TipoMovimento } from '../queries'

/**
 * Histórico completo do produto: cada leitura da Olist que mudou o estoque, as baixas que ela
 * causou nos lotes, tudo o que a equipe mudou, falhas de leitura e remoção do controle. Cada
 * linha diz de onde veio e quem fez, com os detalhes técnicos (para investigar um erro).
 */

const VISUAL: Record<TipoMovimento, { icone: LucideIcon; classe: string }> = {
  leitura_olist: { icone: RefreshCw, classe: 'bg-shopify-50 text-shopify-700' },
  baixa_olist: { icone: ArrowDownRight, classe: 'bg-shopify-50 text-shopify-700' },
  cadastro: { icone: Plus, classe: 'bg-volt-50 text-volt-700' },
  ajuste: { icone: Pencil, classe: 'bg-papel text-suave ring-1 ring-inset ring-linha' },
  edicao: { icone: PencilLine, classe: 'bg-papel text-suave ring-1 ring-inset ring-linha' },
  exclusao: { icone: Trash2, classe: 'bg-perigo-50 text-perigo' },
  falha_leitura: { icone: CircleAlert, classe: 'bg-perigo-50 text-perigo' },
  cerveja_cadastrada: { icone: PackagePlus, classe: 'bg-volt-50 text-volt-700' },
  cerveja_atualizada: { icone: Info, classe: 'bg-papel text-suave ring-1 ring-inset ring-linha' },
  cerveja_removida: { icone: PackageX, classe: 'bg-perigo-50 text-perigo' },
  alerta_grupo: { icone: BellRing, classe: 'bg-alerta-50 text-alerta' },
  tratativa: { icone: CircleCheck, classe: 'bg-sucesso-50 text-sucesso' },
  balanco: { icone: ClipboardCheck, classe: 'bg-ink text-white' },
  falha_balanco: { icone: CircleAlert, classe: 'bg-perigo-50 text-perigo' },
}

const FAIXAS: Record<string, string> = { alerta: 'Alerta (16 a 30 dias)', atencao: 'Atenção (8 a 15 dias)', critico: 'Crítico (até 7 dias)' }

const ORIGENS: Record<string, string> = {
  rotina: 'leitura automática',
  aviso_olist: 'aviso da Olist',
  botao: 'botão “Atualizar da Olist”',
  salvar_lote: 'leitura ao salvar lote',
  cadastro: 'cadastro pelo SKU',
  conferencia: 'conferência depois de salvar',
  manual: 'mudança da equipe',
  alteracao_direta: 'alteração direta no banco (fora do CRM)',
  leitura: 'leitura da Olist',
  balanco: 'balanço de estoque',
}

const un = (n: number) => `${formatarNumero(n)} un.`
const comSinal = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${un(Math.abs(n))}`
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : v === null || v === undefined ? null : String(v))
/** ["antes", "depois"] gravado pelo banco. */
const par = (v: unknown): [unknown, unknown] | null => (Array.isArray(v) && v.length === 2 ? [v[0], v[1]] : null)

/** Frase principal e, se houver, uma linha de complemento. */
function descrever(m: MovimentoDoLote): { titulo: string; complemento?: string; destaque?: 'entrada' | 'saida' | 'erro' } {
  const d = m.detalhes
  const lote = m.lote ?? '—'
  switch (m.tipo) {
    case 'leitura_olist': {
      const antes = m.estoque_antes
      const depois = m.estoque_depois
      const semLote = numero(d.sem_lote_depois)
      const complemento = semLote ? `${un(semLote)} ficaram sem lote (cadastre o lote delas).` : undefined
      if (depois === null) return { titulo: `A Olist deixou de informar o estoque (era ${antes === null ? '—' : un(antes)})`, destaque: 'erro' }
      if (antes === null) return { titulo: `Estoque na Olist: ${un(depois)}`, complemento }
      const variacao = m.quantidade ?? depois - antes
      return {
        titulo: `Estoque na Olist: ${formatarNumero(antes)} → ${un(depois)} (${comSinal(variacao)})`,
        complemento: complemento ?? (variacao > 0 ? 'Entrada de mercadoria na Olist.' : undefined),
        destaque: variacao > 0 ? 'entrada' : 'saida',
      }
    }
    case 'baixa_olist': {
      const antes = numero(d.antes)
      return {
        titulo: `Baixa automática: ${un(Math.abs(m.quantidade ?? 0))} do lote ${lote}${antes !== null && m.saldo !== null ? ` (${formatarNumero(antes)} → ${un(m.saldo)})` : ''}`,
        complemento: texto(d.validade) ? `Lote que vence primeiro (validade ${formatarData(texto(d.validade))}).` : undefined,
      }
    }
    case 'cadastro':
      return {
        titulo: `Lote ${lote} cadastrado com ${m.saldo === null ? 'quantidade a informar' : un(m.saldo)}`,
        complemento: [texto(d.validade) ? `Validade ${formatarData(texto(d.validade))}` : null, m.estoque_depois !== null ? `estoque na Olist ${un(m.estoque_depois)}` : null]
          .filter(Boolean)
          .join(' · '),
      }
    case 'ajuste': {
      const antes = numero(d.antes)
      return {
        titulo: `Lote ${lote}: quantidade ${antes === null ? '—' : formatarNumero(antes)} → ${m.saldo === null ? '—' : un(m.saldo)}${m.quantidade ? ` (${comSinal(m.quantidade)})` : ''}`,
        complemento: m.estoque_depois !== null ? `Estoque na Olist naquele momento: ${un(m.estoque_depois)}` : undefined,
      }
    }
    case 'edicao': {
      const partes: string[] = []
      const codigo = par(d.lote)
      const validade = par(d.validade)
      if (codigo) partes.push(`código ${texto(codigo[0])} → ${texto(codigo[1])}`)
      if (validade) partes.push(`validade ${formatarData(texto(validade[0]))} → ${formatarData(texto(validade[1]))}`)
      if (par(d.cerveja_id)) partes.push('lote passado para outra cerveja')
      return { titulo: `Lote ${lote} editado: ${partes.join('; ') || 'dados alterados'}` }
    }
    case 'exclusao': {
      const antes = numero(d.antes)
      return {
        titulo: `Lote ${lote} excluído${antes ? ` (tinha ${un(antes)}, que passaram a “sem lote”)` : ''}`,
        complemento: texto(d.validade) ? `Validade era ${formatarData(texto(d.validade))}` : undefined,
      }
    }
    case 'falha_leitura':
      return { titulo: 'Não foi possível ler a Olist', complemento: texto(d.erro) ?? undefined, destaque: 'erro' }
    case 'cerveja_cadastrada':
      return {
        titulo: `Cerveja cadastrada no controle pelo SKU ${m.sku ?? '—'}${m.estoque_depois !== null ? ` (estoque na Olist: ${un(m.estoque_depois)})` : ''}`,
        complemento: d.registrado_depois ? 'Registro feito quando o histórico completo foi ligado.' : undefined,
      }
    case 'cerveja_atualizada': {
      const partes: string[] = []
      const nome = par(d.nome)
      const sku = par(d.sku)
      const foto = par(d.foto)
      if (nome) partes.push(`nome “${texto(nome[0])}” → “${texto(nome[1])}”`)
      if (sku) partes.push(`SKU ${texto(sku[0])} → ${texto(sku[1])}`)
      if (foto) partes.push(foto[1] ? 'foto copiada da Olist' : 'foto removida')
      if (par(d.olist_id)) partes.push('produto da Olist trocado')
      return { titulo: `Dados do produto mudaram: ${partes.join('; ') || 'atualizados'}` }
    }
    case 'alerta_grupo': {
      const dias = numero(d.dias)
      return {
        titulo: `Aviso no grupo: lote ${lote} entrou em ${FAIXAS[texto(d.faixa) ?? ''] ?? texto(d.faixa) ?? '—'}`,
        complemento:
          dias === null ? undefined : `Faltavam ${dias} dia${dias === 1 ? '' : 's'} para vencer (validade ${formatarData(texto(d.validade))}).`,
      }
    }
    case 'tratativa':
      return { titulo: `Tratativa do lote ${lote} registrada`, complemento: texto(d.texto) ?? undefined }
    case 'balanco': {
      const antes = m.estoque_antes
      const depois = m.estoque_depois
      const lotes = Array.isArray(d.lotes) ? (d.lotes as Array<Record<string, unknown>>) : []
      const lancamento = numero(d.id_lancamento)
      const conferido = numero(d.conferido_na_olist)
      const contagem = lotes
        .map((l) => {
          const contado = numero(l.contado)
          const quantoHavia = numero(l.antes)
          const comoEra = l.novo ? 'lote novo' : quantoHavia === null ? 'sem quantidade antes' : quantoHavia === contado ? 'igual' : `eram ${formatarNumero(quantoHavia)}`
          return `${texto(l.lote)} ${contado === null ? '—' : formatarNumero(contado)} (${comoEra})`
        })
        .join('; ')
      return {
        titulo:
          depois === null
            ? 'Balanço de estoque enviado à Olist'
            : antes === null
              ? `Balanço de estoque: a Olist ficou com ${un(depois)}`
              : antes === depois
                ? `Balanço de estoque: a Olist continua com ${un(depois)}`
                : `Balanço de estoque: a Olist passou de ${formatarNumero(antes)} para ${un(depois)} (${comSinal(depois - antes)})`,
        complemento: [
          contagem ? `Contagem por lote: ${contagem}.` : null,
          lancamento !== null ? `Lançamento ${lancamento} na Olist.` : null,
          conferido !== null && depois !== null && conferido !== depois ? `Na conferência a Olist mostrou ${un(conferido)}.` : null,
        ]
          .filter(Boolean)
          .join(' '),
      }
    }
    case 'falha_balanco': {
      const total = numero(d.total)
      return {
        titulo:
          texto(d.situacao) === 'recusado'
            ? `Balanço de estoque não foi aceito${total === null ? '' : ` (seriam ${un(total)})`}: nada mudou na Olist`
            : `Balanço de estoque sem confirmação${total === null ? '' : ` (seriam ${un(total)})`}: confira o estoque na Olist`,
        complemento: texto(d.erro) ?? undefined,
        destaque: 'erro',
      }
    }
    case 'cerveja_removida': {
      const lotes = Array.isArray(d.lotes) ? (d.lotes as Array<Record<string, unknown>>) : []
      return {
        titulo: 'Cerveja removida do controle de lotes',
        complemento: lotes.length
          ? `Lotes na hora: ${lotes.map((l) => `${texto(l.lote)} (${numero(l.quantidade) === null ? '—' : un(numero(l.quantidade) ?? 0)}, validade ${formatarData(texto(l.validade))})`).join('; ')}`
          : 'Sem lotes cadastrados.',
        destaque: 'erro',
      }
    }
  }
}

function quem(m: MovimentoDoLote) {
  const origem = m.origem ? (ORIGENS[m.origem] ?? m.origem) : null
  const automatico = m.origem === 'rotina' || m.origem === 'aviso_olist'
  const pessoa = m.autor ?? (automatico ? 'automático' : m.origem === 'alteracao_direta' ? null : 'sistema')
  return [origem, pessoa].filter(Boolean).join(' · ')
}

export function HistoricoLotes({ movimentos }: { movimentos: MovimentoDoLote[] }) {
  if (movimentos.length === 0) {
    return <p className="border-t border-linha px-4 py-6 text-center text-sm text-suave lg:px-5">Nenhum evento registrado ainda.</p>
  }
  return (
    <ol className="divide-y divide-linha border-t border-linha">
      {movimentos.map((m) => {
        const { icone: Icone, classe } = VISUAL[m.tipo] ?? VISUAL.cerveja_atualizada
        const { titulo, complemento, destaque } = descrever(m)
        const IconeEvento = m.tipo === 'leitura_olist' && destaque === 'entrada' ? ArrowUpRight : Icone
        return (
          <li key={m.id} className="flex items-start gap-3 px-4 py-3 lg:px-5">
            <span
              className={cn(
                'mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg',
                destaque === 'entrada' ? 'bg-sucesso-50 text-sucesso' : destaque === 'erro' ? 'bg-perigo-50 text-perigo' : classe,
              )}
              aria-hidden
            >
              <IconeEvento className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-5">{titulo}</p>
              {complemento && <p className={cn('mt-0.5 text-[13px] leading-[18px]', destaque === 'erro' ? 'text-perigo' : 'text-suave')}>{complemento}</p>}
              <p className="tipo-dado mt-1 text-[11px] text-suave">
                {formatarDataHora(m.criado_em)} · {quem(m)}
              </p>
              <details className="group mt-1">
                <summary className="cursor-pointer list-none text-[11px] font-medium text-sutil hover:text-suave [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Detalhes técnicos</span>
                  <span className="hidden group-open:inline">Esconder detalhes</span>
                </summary>
                <pre className="tipo-dado mt-1 overflow-x-auto rounded-lg bg-papel p-2 text-[11px] leading-4 whitespace-pre-wrap text-suave">
                  {JSON.stringify(
                    {
                      evento: m.id,
                      tipo: m.tipo,
                      quando: m.criado_em,
                      origem: m.origem,
                      papel_no_banco: m.papel,
                      sku: m.sku,
                      lote: m.lote,
                      variacao: m.quantidade,
                      saldo_do_lote: m.saldo,
                      estoque_antes: m.estoque_antes,
                      estoque_depois: m.estoque_depois,
                      ...m.detalhes,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
