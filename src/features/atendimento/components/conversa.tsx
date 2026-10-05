'use client'

import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCheck,
  ChevronLeft,
  CircleCheckBig,
  Clock3,
  Download,
  FileText,
  Hourglass,
  Info,
  LoaderCircle,
  MapPin,
  RotateCcw,
  SendHorizontal,
  StickyNote,
  UserRoundCheck,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { diasDesde } from '@/lib/datas'
import { formatarData, formatarDataPorExtenso, formatarHora, formatarWhatsapp } from '@/lib/format'
import { STATUS_ATENDIMENTO } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

import {
  adicionarNota,
  alterarStatusAtendimento,
  assumirAtendimento,
  baixarMidiaNovamente,
  enviarMensagem,
  marcarComoLido,
  reenviarMensagem,
  sincronizarConversaAgora,
} from '../actions'
import type { Conversa as DadosConversa, EventoConversa, MembroEquipe, MensagemConversa } from '../queries'
import { PainelContato } from './painel-contato'
import { TextoWhatsapp } from './texto-whatsapp'

type Item =
  | { tipo: 'dia'; chave: string; rotulo: string }
  | { tipo: 'mensagem'; chave: string; m: MensagemConversa }
  | { tipo: 'evento'; chave: string; e: EventoConversa }

const ROTULO_MIDIA: Record<string, string> = {
  imagem: 'Foto',
  audio: 'Áudio',
  video: 'Vídeo',
  documento: 'Documento',
  figurinha: 'Figurinha',
}

function rotuloDia(iso: string) {
  const dias = diasDesde(iso)
  if (dias === 0) return 'Hoje'
  if (dias === 1) return 'Ontem'
  return formatarDataPorExtenso(iso)
}

function montarLinhaDoTempo(mensagens: MensagemConversa[], eventos: EventoConversa[]): Item[] {
  const brutos = [
    ...mensagens.map((m) => ({ quando: m.enviada_em, item: { tipo: 'mensagem' as const, chave: m.id, m } })),
    ...eventos.map((e) => ({ quando: e.criado_em, item: { tipo: 'evento' as const, chave: e.id, e } })),
  ].sort((a, b) => a.quando.localeCompare(b.quando))

  const itens: Item[] = []
  let diaAnterior = ''
  for (const { quando, item } of brutos) {
    const dia = formatarData(quando)
    if (dia !== diaAnterior) {
      itens.push({ tipo: 'dia', chave: `dia-${dia}`, rotulo: rotuloDia(quando) })
      diaAnterior = dia
    }
    itens.push(item)
  }
  return itens
}

// Mensagens -------------------------------------------------------------------------

function StatusEnvio({ m }: { m: MensagemConversa }) {
  if (m.direcao !== 'saida') return null
  switch (m.status) {
    case 'enviando':
      return <Clock3 className="size-3.5 text-sutil" aria-label="Enviando" />
    case 'enviada':
      return <Check className="size-3.5 text-sutil" aria-label="Enviada" />
    case 'entregue':
      return <CheckCheck className="size-3.5 text-sutil" aria-label="Entregue" />
    case 'lida':
      return <CheckCheck className="size-3.5 text-shopify" aria-label="Lida" />
    case 'falhou':
      return <AlertCircle className="size-3.5 text-perigo" aria-label="Falhou" />
    default:
      return null
  }
}

function Midia({ m }: { m: MensagemConversa }) {
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()
  const rotulo = ROTULO_MIDIA[m.tipo] ?? 'Mídia'
  const url = m.midia_url

  if (m.midia_status === 'pronta' && url) {
    switch (m.tipo) {
      case 'imagem':
        return (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket privado */}
            <img src={url} alt={m.texto ?? 'Foto'} loading="lazy" className="max-h-72 w-auto max-w-full rounded-lg object-cover" />
          </a>
        )
      case 'figurinha':
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket privado
        return <img src={url} alt="Figurinha" loading="lazy" className="size-32 object-contain" />
      case 'audio':
        return <audio controls preload="none" src={url} className="h-10 w-64 max-w-full" />
      case 'video':
        return <video controls preload="metadata" src={url} className="max-h-72 max-w-full rounded-lg" />
      default:
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={m.midia_nome ?? undefined}
            className="flex items-center gap-2 rounded-lg bg-ink/5 px-3 py-2 text-[13px] font-medium hover:bg-ink/10"
          >
            <FileText className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{m.midia_nome ?? 'Documento'}</span>
            <Download className="ml-auto size-3.5 shrink-0" aria-hidden />
          </a>
        )
    }
  }

  if (m.midia_status === 'pendente' && !m.midia_travada) {
    return (
      <span className="flex items-center gap-2 text-[13px] text-suave">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Carregando {rotulo.toLowerCase()}…
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-[13px] text-suave">
      {m.midia_status === 'indisponivel' ? `${rotulo} indisponível` : rotulo}
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await baixarMidiaNovamente(m.id)
            if (r.ok === false && r.mensagem) avisar(r.mensagem, 'erro')
          })
        }
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-volt-700 hover:bg-volt-50"
      >
        {pendente ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : <Download className="size-3" aria-hidden />}
        Baixar
      </button>
    </span>
  )
}

function Bolha({ m, autor }: { m: MensagemConversa; autor: string | null }) {
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()
  const saida = m.direcao === 'saida'

  if (m.tipo === 'reacao') {
    return (
      <div className={cn('flex', saida ? 'justify-end' : 'justify-start')}>
        <span className="rounded-full bg-superficie px-2.5 py-0.5 text-[12px] text-suave ring-1 ring-linha">
          {saida ? 'Você reagiu' : 'Reagiu'} {m.texto}
        </span>
      </div>
    )
  }

  const temMidia = m.tipo in ROTULO_MIDIA
  return (
    <div className={cn('flex', saida ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-[14px] leading-[21px] shadow-cartao sm:max-w-[70%]',
          saida ? 'rounded-br-md bg-whatsapp-50 ring-1 ring-whatsapp/15' : 'rounded-bl-md bg-superficie ring-1 ring-linha',
          m.status === 'falhou' && 'ring-perigo/40',
        )}
      >
        {temMidia && (
          <div className={cn(m.texto && 'mb-1.5')}>
            <Midia m={m} />
          </div>
        )}
        {m.tipo === 'localizacao' && <MapPin className="mb-0.5 inline size-3.5 text-suave" aria-hidden />}
        {m.texto && m.tipo !== 'documento' && <TextoWhatsapp texto={m.texto} />}
        {m.texto && m.tipo === 'documento' && m.texto !== m.midia_nome && <TextoWhatsapp texto={m.texto} />}
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-sutil">
          {saida && <span className="truncate">{autor ?? 'Pelo celular'} ·</span>}
          <span className="tipo-dado text-[11px]">{formatarHora(m.enviada_em)}</span>
          <StatusEnvio m={m} />
        </div>
        {m.status === 'falhou' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-perigo/20 pt-1.5 text-[12px] text-perigo">
            <span className="min-w-0 flex-1">{m.erro ?? 'Não enviada.'}</span>
            <button
              type="button"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await reenviarMensagem(m.id)
                  if (r.mensagem) avisar(r.mensagem, r.ok === false ? 'erro' : 'sucesso')
                })
              }
              className="inline-flex items-center gap-1 font-semibold hover:underline"
            >
              <RotateCcw className="size-3" aria-hidden /> Tentar de novo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Eventos ---------------------------------------------------------------------------

function Evento({ e, nomes, numeros }: { e: EventoConversa; nomes: Map<string, string>; numeros: Map<string, number> }) {
  const autor = e.autor_id ? (nomes.get(e.autor_id) ?? 'Alguém') : null
  const para = e.para_id ? (nomes.get(e.para_id) ?? 'alguém') : null

  if (e.tipo === 'nota') {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-[85%] rounded-2xl border border-vip/30 bg-vip-50 px-3 py-2 text-[14px] leading-[21px] sm:max-w-[70%]">
          <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-vip-700">
            <StickyNote className="size-3" aria-hidden /> Nota interna · {autor ?? 'Equipe'}
          </p>
          <TextoWhatsapp texto={e.texto ?? ''} />
          <p className="tipo-dado mt-1 text-right text-[11px] text-vip-700/70">{formatarHora(e.criado_em)}</p>
        </div>
      </div>
    )
  }

  if (e.tipo === 'aberto') {
    return (
      <div className="flex items-center gap-3 py-1 text-[11px] font-semibold text-suave">
        <span className="h-px flex-1 bg-linha" />
        Atendimento #{numeros.get(e.atendimento_id) ?? '—'} aberto · {formatarHora(e.criado_em)}
        <span className="h-px flex-1 bg-linha" />
      </div>
    )
  }

  const rotuloStatus = e.status ? STATUS_ATENDIMENTO[e.status].rotulo.toLowerCase() : ''
  const texto =
    e.tipo === 'assumido'
      ? `${autor ?? 'Alguém'} assumiu o atendimento`
      : e.tipo === 'transferido'
        ? `${autor ?? 'Alguém'} transferiu para ${para}`
        : e.tipo === 'resolvido'
          ? `${autor ?? 'Alguém'} resolveu o atendimento #${numeros.get(e.atendimento_id) ?? ''}`
          : autor
            ? e.status === 'fila'
              ? `${autor} devolveu para a fila`
              : `${autor} marcou como ${rotuloStatus}`
            : `${e.texto ?? 'Status alterado'} · ${rotuloStatus}`

  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-ink/[0.05] px-3 py-1 text-center text-[11px] text-suave">
        {texto} · <span className="tipo-dado text-[11px]">{formatarHora(e.criado_em)}</span>
      </span>
    </div>
  )
}

// Compositor ------------------------------------------------------------------------

function Compositor({ atendimentoId, naFila }: { atendimentoId: string; naFila: boolean }) {
  const [modo, setModo] = useState<'mensagem' | 'nota'>('mensagem')
  const [texto, setTexto] = useState('')
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()
  const campo = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [texto])

  const enviar = () => {
    const conteudo = texto.trim()
    if (!conteudo || pendente) return
    setTexto('')
    iniciar(async () => {
      const r: { ok?: boolean; mensagem?: string; registrada?: boolean } =
        modo === 'nota' ? await adicionarNota(atendimentoId, conteudo) : await enviarMensagem(atendimentoId, conteudo)
      if (r.ok === false) {
        // Se a mensagem já está na conversa, ela mostra "Tentar de novo"; senão, o texto volta ao campo.
        if (!r.registrada) setTexto(conteudo)
        avisar(r.mensagem ?? 'Não foi possível enviar.', 'erro')
      }
      campo.current?.focus()
    })
  }

  const nota = modo === 'nota'
  return (
    <div className={cn('border-t border-linha p-2.5 sm:p-3', nota ? 'bg-vip-50' : 'bg-superficie')}>
      <div className="mb-2 flex items-center gap-1">
        {(['mensagem', 'nota'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            aria-pressed={modo === m}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors',
              modo === m ? (m === 'nota' ? 'bg-vip text-ink' : 'bg-ink text-white') : 'text-suave hover:bg-ink/5 hover:text-ink',
            )}
          >
            {m === 'nota' ? <StickyNote className="size-3.5" aria-hidden /> : <SendHorizontal className="size-3.5" aria-hidden />}
            {m === 'nota' ? 'Nota interna' : 'Mensagem'}
          </button>
        ))}
        <span className="ml-auto hidden text-[11px] text-sutil sm:inline">
          {nota ? 'Só a equipe vê' : naFila ? 'Responder assume o atendimento' : 'Enter envia · Shift+Enter quebra linha'}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            const toque = window.matchMedia('(pointer: coarse)').matches
            if (e.key === 'Enter' && !e.shiftKey && !toque && !e.nativeEvent.isComposing) {
              e.preventDefault()
              enviar()
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={nota ? 'Escreva uma nota para a equipe…' : 'Escreva uma mensagem…'}
          aria-label={nota ? 'Nota interna' : 'Mensagem para o cliente'}
          className={cn(
            'max-h-40 min-h-11 flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-[15px] leading-6 outline-none placeholder:text-sutil focus:ring-4',
            nota ? 'border-vip/40 bg-superficie focus:border-vip-700 focus:ring-vip/20' : 'border-linha bg-papel focus:border-ink focus:bg-superficie focus:ring-volt/25',
          )}
        />
        <Button
          variante={nota ? 'escuro' : 'primario'}
          tamanho="icone"
          className="size-11 rounded-xl lg:size-11"
          onClick={enviar}
          disabled={!texto.trim()}
          carregando={pendente}
          aria-label={nota ? 'Salvar nota' : 'Enviar mensagem'}
          title={nota ? 'Salvar nota' : 'Enviar'}
        >
          {!pendente && (nota ? <StickyNote /> : <SendHorizontal />)}
        </Button>
      </div>
    </div>
  )
}

// Conversa --------------------------------------------------------------------------

export function Conversa({
  conversa,
  equipe,
  meuId,
  pastas,
  pastaPadraoId,
  voltarHref,
}: {
  conversa: DadosConversa
  equipe: MembroEquipe[]
  meuId: string
  pastas: Array<{ id: string; nome: string }>
  pastaPadraoId: string | null
  voltarHref: string
}) {
  const { atendimento, contato, mensagens, eventos, atendimentos } = conversa
  const id = atendimento.id!
  const [painel, setPainel] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [longe, setLonge] = useState(false)
  const avisar = useAvisos()
  const rolagem = useRef<HTMLDivElement>(null)
  const pertoDoFim = useRef(true)

  const nomes = useMemo(() => new Map(equipe.map((m) => [m.id, m.nome])), [equipe])
  const numeros = useMemo(() => new Map(atendimentos.map((a) => [a.id, a.numero])), [atendimentos])
  const itens = useMemo(() => montarLinhaDoTempo(mensagens, eventos), [mensagens, eventos])

  const nome = atendimento.contato_nome || formatarWhatsapp(contato.whatsapp) || 'Contato do WhatsApp'
  const status = atendimento.status ? STATUS_ATENDIMENTO[atendimento.status] : null
  const aberto = atendimento.status !== 'resolvido'
  const outroAberto = atendimentos.find((a) => a.status !== 'resolvido' && a.id !== id)
  const responsavel = atendimento.responsavel_id ? (nomes.get(atendimento.responsavel_id) ?? atendimento.responsavel_nome) : null

  // Abriu a conversa (ou chegou mensagem com ela aberta): marca como lida aqui e no WhatsApp.
  useEffect(() => {
    if ((atendimento.nao_lidas ?? 0) > 0 && document.visibilityState === 'visible') void marcarComoLido(id)
  }, [id, atendimento.nao_lidas])

  // Confere com a uazapi se faltou alguma mensagem (webhook perdido), uma vez por conversa aberta.
  useEffect(() => {
    void sincronizarConversaAgora(contato.id, { silencioso: true })
  }, [contato.id])

  // Rolagem: começa no fim; desce sozinho com mensagens novas se você já estava no fim.
  useLayoutEffect(() => {
    const el = rolagem.current
    if (el && pertoDoFim.current) el.scrollTop = el.scrollHeight
  }, [itens.length])
  useLayoutEffect(() => {
    pertoDoFim.current = true
    const el = rolagem.current
    if (el) el.scrollTop = el.scrollHeight
  }, [id])

  const executar = (acao: () => Promise<{ ok?: boolean; mensagem?: string }>) =>
    iniciar(async () => {
      const r = await acao()
      if (r.mensagem) avisar(r.mensagem, r.ok === false ? 'erro' : 'sucesso')
    })

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Cabeçalho */}
        <header className="flex items-center gap-2 border-b border-linha bg-superficie px-2 py-2 sm:px-3">
          <Link href={voltarHref} className="grid size-9 shrink-0 place-items-center rounded-lg text-suave hover:bg-papel lg:hidden" aria-label="Voltar para a lista">
            <ChevronLeft className="size-5" />
          </Link>
          <button type="button" onClick={() => setPainel(true)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left xl:pointer-events-none">
            <Avatar nome={nome} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{nome}</span>
              <span className="flex items-center gap-1.5 truncate text-[12px] text-suave">
                {contato.whatsapp && <span className="tipo-dado text-[12px]">{formatarWhatsapp(contato.whatsapp)}</span>}
                {responsavel && <span className="truncate">· {atendimento.responsavel_id === meuId ? 'com você' : `com ${responsavel}`}</span>}
              </span>
            </span>
          </button>
          {status && (
            <Badge tom={status.tom} ponto className="hidden sm:inline-flex">
              {status.rotulo}
            </Badge>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            {aberto && !atendimento.responsavel_id && (
              <Button tamanho="sm" variante="escuro" carregando={pendente} onClick={() => executar(() => assumirAtendimento(id))}>
                <UserRoundCheck /> <span className="hidden sm:inline">Assumir</span>
              </Button>
            )}
            {atendimento.status === 'em_atendimento' && (
              <Button tamanho="sm" carregando={pendente} onClick={() => executar(() => alterarStatusAtendimento(id, 'aguardando_cliente'))} title="Aguardando cliente">
                <Hourglass /> <span className="hidden md:inline">Aguardando</span>
              </Button>
            )}
            {aberto ? (
              <Button tamanho="sm" carregando={pendente} onClick={() => executar(() => alterarStatusAtendimento(id, 'resolvido'))} title="Resolver">
                <CircleCheckBig /> <span className="hidden md:inline">Resolver</span>
              </Button>
            ) : null}
            <Button tamanho="icone" variante="fantasma" onClick={() => setPainel(true)} className="xl:hidden" aria-label="Detalhes do contato">
              <Info />
            </Button>
          </div>
        </header>

        {/* Linha do tempo */}
        <div
          ref={rolagem}
          onScroll={(e) => {
            const el = e.currentTarget
            const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 160
            pertoDoFim.current = perto
            if (perto === longe) setLonge(!perto)
          }}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-papel px-3 py-4 sm:px-5"
        >
          {mensagens.length === 400 && (
            <p className="text-center text-[11px] text-sutil">Mostrando as 400 mensagens mais recentes deste contato.</p>
          )}
          {itens.map((item) =>
            item.tipo === 'dia' ? (
              <div key={item.chave} className="sticky top-0 z-10 flex justify-center py-1">
                <span className="rounded-full bg-superficie/95 px-3 py-0.5 text-[11px] font-semibold text-suave shadow-cartao ring-1 ring-linha backdrop-blur">
                  {item.rotulo}
                </span>
              </div>
            ) : item.tipo === 'mensagem' ? (
              <Bolha key={item.chave} m={item.m} autor={item.m.enviada_por ? (nomes.get(item.m.enviada_por) ?? 'Equipe') : null} />
            ) : (
              <Evento key={item.chave} e={item.e} nomes={nomes} numeros={numeros} />
            ),
          )}
        </div>
        {longe && (
          <button
            type="button"
            onClick={() => rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight, behavior: 'smooth' })}
            className="absolute right-4 bottom-36 z-10 grid size-9 place-items-center rounded-full bg-superficie text-ink shadow-flutuante ring-1 ring-linha xl:right-[336px]"
            aria-label="Ir para a última mensagem"
          >
            <ArrowDown className="size-4" />
          </button>
        )}

        {/* Rodapé */}
        {aberto ? (
          <Compositor key={id} atendimentoId={id} naFila={!atendimento.responsavel_id} />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-linha bg-superficie px-3 py-3 text-[13px] text-suave">
            <span>Atendimento resolvido{atendimento.resolvido_em ? ` em ${formatarData(atendimento.resolvido_em)}` : ''}.</span>
            {outroAberto ? (
              <Link href={`/atendimento?aba=abertos&id=${outroAberto.id}`} className="font-semibold text-volt-700 hover:text-ink">
                Ir para o atendimento aberto #{outroAberto.numero} →
              </Link>
            ) : (
              <Button tamanho="sm" carregando={pendente} onClick={() => executar(() => alterarStatusAtendimento(id, 'em_atendimento'))}>
                <RotateCcw /> Reabrir
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Painel do contato: fixo no desktop largo, gaveta nas telas menores */}
      {painel && <button type="button" aria-label="Fechar detalhes" onClick={() => setPainel(false)} className="animar-fundo fixed inset-0 z-40 bg-ink/40 xl:hidden" />}
      <aside
        className={cn(
          'min-h-0 w-[320px] shrink-0 overflow-y-auto border-l border-linha bg-superficie',
          'max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-50 max-xl:w-[min(360px,100vw)] max-xl:shadow-flutuante',
          painel ? 'max-xl:block' : 'max-xl:hidden',
        )}
        aria-label="Detalhes do contato"
      >
        <div className="sticky top-0 z-10 flex justify-end bg-superficie/95 p-2 backdrop-blur xl:hidden">
          <Button tamanho="icone" variante="fantasma" onClick={() => setPainel(false)} aria-label="Fechar">
            <X />
          </Button>
        </div>
        <PainelContato conversa={conversa} equipe={equipe} pastas={pastas} pastaPadraoId={pastaPadraoId} />
      </aside>
    </div>
  )
}
