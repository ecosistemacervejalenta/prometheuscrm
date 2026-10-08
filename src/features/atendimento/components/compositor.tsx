'use client'

import { FileText, Mic, Paperclip, SendHorizontal, Square, StickyNote, Trash2, Video, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from 'react'

import { Select } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

import { adicionarNota, definirAssinatura, enviarArquivo, enviarMensagem } from '../actions'

/**
 * Campo de envio da conversa: texto, nota interna, anexos (clipe, colar print,
 * arrastar e soltar) e mensagem de voz gravada no navegador.
 * O arquivo sobe direto do navegador para o bucket privado "whatsapp" e a
 * Server Action só registra e manda a uazapi buscá-lo (sem limite de 4,5 MB da Vercel).
 */

export type TipoAnexo = 'imagem' | 'video' | 'audio' | 'documento'

export type Anexo = {
  id: string
  arquivo: Blob
  nome: string
  mime: string
  tipo: TipoAnexo
  tamanho: number
  previa: string | null
  segundos: number | null
  gravado: boolean
}

/** Limite do bucket. O WhatsApp aceita fotos e vídeos de até 16 MB. */
const LIMITE = 25 * 1024 * 1024
const DURACAO_MAXIMA = 5 * 60

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'application/pdf': 'pdf',
}

function tipoDoMime(mime: string): TipoAnexo {
  if (/^image\/(jpeg|png|webp)$/.test(mime)) return 'imagem'
  if (mime === 'video/mp4') return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'documento'
}

function extensao(a: Pick<Anexo, 'nome' | 'mime'>) {
  const doNome = a.nome.match(/\.([a-z0-9]{1,8})$/i)?.[1]
  return (doNome ?? EXTENSOES[a.mime] ?? 'bin').toLowerCase()
}

function tamanhoLegivel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function duracao(segundos: number) {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
}

function liberar(a: Anexo) {
  if (a.previa) URL.revokeObjectURL(a.previa)
}

async function subirArquivo(contatoId: string, a: Anexo) {
  const caminho = `${contatoId}/envios/${crypto.randomUUID()}.${extensao(a)}`
  const { error } = await createClient().storage.from('whatsapp').upload(caminho, a.arquivo, { contentType: a.mime, upsert: false })
  if (error) throw error
  return caminho
}

/** Anexos da conversa (fica na Conversa para aceitar arquivos soltos em qualquer ponto dela). */
export function useAnexos() {
  const avisar = useAvisos()
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const atuais = useRef<Anexo[]>([])

  useEffect(() => {
    atuais.current = anexos
  }, [anexos])
  useEffect(() => () => atuais.current.forEach(liberar), [])

  const adicionarAnexo = useCallback((a: Anexo) => setAnexos((lista) => [...lista, a].slice(0, 10)), [])

  const adicionarArquivos = useCallback(
    (arquivos: File[]) => {
      for (const arquivo of arquivos) {
        if (arquivo.size > LIMITE) {
          avisar(`${arquivo.name || 'Arquivo'} passa de 25 MB. Envie pelo celular ou compacte antes.`, 'erro')
          continue
        }
        const mime = arquivo.type || 'application/octet-stream'
        const tipo = tipoDoMime(mime)
        adicionarAnexo({
          id: crypto.randomUUID(),
          arquivo,
          nome: arquivo.name || (tipo === 'imagem' ? 'print.png' : 'arquivo'),
          mime,
          tipo,
          tamanho: arquivo.size,
          previa: tipo === 'documento' ? null : URL.createObjectURL(arquivo),
          segundos: null,
          gravado: false,
        })
      }
    },
    [adicionarAnexo, avisar],
  )

  const remover = useCallback((id: string) => {
    setAnexos((lista) => {
      const alvo = lista.find((a) => a.id === id)
      if (alvo) liberar(alvo)
      return lista.filter((a) => a.id !== id)
    })
  }, [])

  /** Tira todos da fila de envio (quem chama libera as prévias depois de enviar). */
  const retirarTodos = useCallback(() => {
    const lista = atuais.current
    setAnexos([])
    return lista
  }, [])

  return { anexos, adicionarArquivos, adicionarAnexo, remover, retirarTodos }
}

export type ControleAnexos = ReturnType<typeof useAnexos>

// Gravador de voz --------------------------------------------------------------------

type Gravacao = { gravador: MediaRecorder; stream: MediaStream; partes: Blob[]; inicio: number; descartar: boolean }

function useGravador(aoConcluir: (a: Anexo) => void) {
  const avisar = useAvisos()
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const atual = useRef<Gravacao | null>(null)

  const parar = useCallback((descartar: boolean) => {
    const g = atual.current
    if (!g) return
    g.descartar = descartar
    if (g.gravador.state !== 'inactive') g.gravador.stop()
  }, [])

  useEffect(() => {
    if (!gravando) return
    const relogio = setInterval(() => {
      const g = atual.current
      if (!g) return
      const s = Math.floor((Date.now() - g.inicio) / 1000)
      setSegundos(s)
      if (s >= DURACAO_MAXIMA) parar(false)
    }, 250)
    return () => clearInterval(relogio)
  }, [gravando, parar])

  // Saiu da conversa no meio da gravação: descarta e solta o microfone.
  useEffect(() => () => parar(true), [parar])

  const iniciar = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      avisar('Este navegador não permite gravar áudio.', 'erro')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      avisar('Permita o uso do microfone no navegador para gravar áudio.', 'erro')
      return
    }
    const formato = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t))
    const gravador = new MediaRecorder(stream, formato ? { mimeType: formato } : undefined)
    const g: Gravacao = { gravador, stream, partes: [], inicio: Date.now(), descartar: false }
    atual.current = g

    gravador.ondataavailable = (e) => {
      if (e.data.size) g.partes.push(e.data)
    }
    gravador.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      atual.current = null
      setGravando(false)
      if (g.descartar) return
      const mime = (gravador.mimeType || 'audio/webm').split(';')[0]
      const audio = new Blob(g.partes, { type: mime })
      const duracaoReal = Math.round((Date.now() - g.inicio) / 1000)
      if (audio.size < 800 || duracaoReal < 1) {
        avisar('Áudio muito curto. Segure um pouco mais.', 'erro')
        return
      }
      aoConcluir({
        id: crypto.randomUUID(),
        arquivo: audio,
        nome: `voz.${EXTENSOES[mime] ?? 'webm'}`,
        mime,
        tipo: 'audio',
        tamanho: audio.size,
        previa: URL.createObjectURL(audio),
        segundos: duracaoReal,
        gravado: true,
      })
    }

    gravador.start(250)
    setSegundos(0)
    setGravando(true)
  }, [aoConcluir, avisar])

  return { gravando, segundos, iniciar, parar }
}

// Prévia dos anexos -------------------------------------------------------------------

function PreviaAnexo({ a, aoRemover }: { a: Anexo; aoRemover: () => void }) {
  return (
    <li className="relative flex shrink-0 items-center gap-2 rounded-xl bg-superficie p-1.5 pr-8 ring-1 ring-linha">
      {a.tipo === 'imagem' && a.previa ? (
        // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
        <img src={a.previa} alt={a.nome} className="size-14 rounded-lg object-cover" />
      ) : a.tipo === 'audio' && a.previa ? (
        <audio controls src={a.previa} className="h-9 w-56" />
      ) : (
        <span className="grid size-14 place-items-center rounded-lg bg-papel text-suave">
          {a.tipo === 'video' ? <Video className="size-5" aria-hidden /> : <FileText className="size-5" aria-hidden />}
        </span>
      )}
      {a.tipo !== 'audio' && (
        <span className="max-w-40 min-w-0">
          <span className="block truncate text-[12px] font-semibold">{a.nome}</span>
          <span className="tipo-dado text-[11px] text-suave">{tamanhoLegivel(a.tamanho)}</span>
        </span>
      )}
      {a.gravado && a.segundos !== null && <span className="tipo-dado text-[11px] text-suave">{duracao(a.segundos)}</span>}
      <button
        type="button"
        onClick={aoRemover}
        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full text-suave hover:bg-papel hover:text-ink"
        aria-label={`Remover ${a.gravado ? 'áudio gravado' : a.nome}`}
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}

// Compositor -------------------------------------------------------------------------

/**
 * "Assinar como": nomes da lista, o escolhido no atendimento (nulo = responsável) e o nome do
 * responsável — na fila, o de quem está logado (responder assume o atendimento).
 */
export type OpcoesAssinatura = { nomes: string[]; escolhido: string | null; responsavel: string | null }

export function Compositor({
  atendimentoId,
  contatoId,
  naFila,
  anexos: controle,
  assinatura,
}: {
  atendimentoId: string
  contatoId: string
  naFila: boolean
  anexos: ControleAnexos
  /** Nulo quando a assinatura está desligada em Configurações › Integrações. */
  assinatura: OpcoesAssinatura | null
}) {
  const [modo, setModo] = useState<'mensagem' | 'nota'>('mensagem')
  const [texto, setTexto] = useState('')
  const [progresso, setProgresso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const avisar = useAvisos()
  const campo = useRef<HTMLTextAreaElement>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const { anexos, adicionarArquivos, adicionarAnexo, remover, retirarTodos } = controle
  const voz = useGravador(adicionarAnexo)
  const nota = modo === 'nota'
  const [trocandoAssinatura, iniciarTroca] = useTransition()
  const [escolhido, setEscolhido] = useOptimistic(assinatura?.escolhido ?? null)

  // O nome do responsável já é a opção padrão: não repete na lista.
  const responsavel = assinatura?.responsavel ?? null
  const mesmoNome = (a: string | null, b: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())
  const valorAssinatura = escolhido && !mesmoNome(escolhido, responsavel) ? escolhido : ''
  const outrosNomes = (assinatura?.nomes ?? []).filter((n) => !mesmoNome(n, responsavel))
  if (valorAssinatura && !outrosNomes.includes(valorAssinatura)) outrosNomes.unshift(valorAssinatura)

  const trocarAssinatura = (valor: string) =>
    iniciarTroca(async () => {
      setEscolhido(valor || null)
      const r = await definirAssinatura(atendimentoId, valor || null)
      if (r.ok === false) avisar(r.mensagem ?? 'Não foi possível trocar o nome da assinatura.', 'erro')
    })

  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    const alvo = el.scrollHeight + 2 // + bordas: sem barra de rolagem até o limite
    el.style.height = `${Math.min(alvo, 160)}px`
    el.style.overflowY = alvo > 160 ? 'auto' : 'hidden'
  }, [texto, voz.gravando])

  const enviar = async () => {
    if (enviando || trocandoAssinatura) return
    const conteudo = texto.trim()
    if (nota) {
      if (!conteudo) return
      setTexto('')
      setEnviando(true)
      const r = await adicionarNota(atendimentoId, conteudo)
      setEnviando(false)
      if (r.ok === false) {
        setTexto(conteudo)
        avisar(r.mensagem ?? 'Não foi possível salvar a nota.', 'erro')
      }
      return
    }

    const lista = retirarTodos()
    if (!conteudo && !lista.length) return
    setTexto('')
    setEnviando(true)
    try {
      // A legenda vai no primeiro arquivo (áudio não tem legenda: aí o texto segue separado).
      const legendaNoArquivo = Boolean(conteudo && lista[0] && lista[0].tipo !== 'audio')
      for (const [i, a] of lista.entries()) {
        setProgresso(lista.length > 1 ? `Enviando ${i + 1} de ${lista.length}…` : a.gravado ? 'Enviando áudio…' : 'Enviando arquivo…')
        let caminho: string
        try {
          caminho = await subirArquivo(contatoId, a)
        } catch {
          avisar(`Não foi possível enviar ${a.gravado ? 'o áudio' : a.nome}. Verifique a internet e tente de novo.`, 'erro')
          continue
        } finally {
          liberar(a)
        }
        const r = await enviarArquivo(atendimentoId, {
          caminho,
          tipo: a.tipo,
          mime: a.mime,
          nome: a.gravado ? null : a.nome,
          segundos: a.segundos,
          gravado: a.gravado,
          legenda: i === 0 && legendaNoArquivo ? conteudo : null,
        })
        if (r.ok === false) {
          avisar(r.mensagem ?? 'Não foi possível enviar o arquivo.', 'erro')
          if (!r.registrada) return
        }
      }
      if (conteudo && !legendaNoArquivo) {
        setProgresso(null)
        const r = await enviarMensagem(atendimentoId, conteudo)
        if (r.ok === false) {
          if (!r.registrada) setTexto(conteudo)
          avisar(r.mensagem ?? 'Não foi possível enviar.', 'erro')
        }
      }
    } finally {
      setEnviando(false)
      setProgresso(null)
      campo.current?.focus()
    }
  }

  const podeEnviar = Boolean(texto.trim()) || (!nota && anexos.length > 0)
  const mostrarMicrofone = !nota && !podeEnviar

  return (
    <div className={cn('min-w-0 border-t border-linha p-2.5 @md:p-3', nota ? 'bg-vip-50' : 'bg-superficie')}>
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1 gap-y-1.5">
        {(['mensagem', 'nota'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            aria-pressed={modo === m}
            disabled={voz.gravando}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors',
              modo === m ? (m === 'nota' ? 'bg-vip text-ink escuro:text-ink-900' : 'bg-ink text-white escuro:bg-ink-600') : 'text-suave hover:bg-ink/5 hover:text-ink',
            )}
          >
            {m === 'nota' ? <StickyNote className="size-3.5" aria-hidden /> : <SendHorizontal className="size-3.5" aria-hidden />}
            {m === 'nota' ? 'Nota interna' : 'Mensagem'}
          </button>
        ))}
        <div className="ml-auto flex min-w-0 items-center gap-3 pl-2">
          <span className={cn('hidden min-w-0 truncate text-[11px] text-sutil', !nota && assinatura ? '@3xl:block' : '@xl:block')}>
            {progresso ??
              (nota
                ? 'Só a equipe vê'
                : anexos.length
                  ? 'O texto vira a legenda do arquivo'
                  : naFila
                    ? 'Responder assume o atendimento'
                    : 'Enter envia · cole prints com Ctrl+V')}
          </span>
          {!nota && assinatura && (
            <label className="flex min-w-0 items-center gap-1.5" title="Nome que o cliente vê em negrito no início da mensagem">
              <span className="shrink-0 text-[12px] font-semibold text-suave">Assinar como:</span>
              <Select
                value={valorAssinatura}
                onChange={(e) => trocarAssinatura(e.target.value)}
                disabled={enviando || voz.gravando}
                aria-busy={trocandoAssinatura}
                className="h-8 w-auto max-w-52 min-w-0 truncate rounded-lg bg-papel pr-8 pl-2.5 text-[13px] font-semibold"
              >
                <option value="">{responsavel ? `${responsavel} (${naFila ? 'você' : 'responsável'})` : 'Responsável'}</option>
                {outrosNomes.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      </div>

      {!nota && anexos.length > 0 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {anexos.map((a) => (
            <PreviaAnexo key={a.id} a={a} aoRemover={() => remover(a.id)} />
          ))}
        </ul>
      )}

      {voz.gravando ? (
        <div className="flex items-center gap-2">
          <Button tamanho="icone" variante="fantasma" className="size-11 rounded-xl" onClick={() => voz.parar(true)} aria-label="Descartar gravação" title="Descartar">
            <Trash2 />
          </Button>
          <div className="flex h-11 flex-1 items-center gap-2.5 rounded-xl border border-perigo/30 bg-perigo-50 px-3.5 text-[14px] text-perigo">
            <span className="size-2.5 animate-pulse rounded-full bg-perigo" aria-hidden />
            Gravando… <span className="tipo-dado">{duracao(voz.segundos)}</span>
            <span className="ml-auto hidden text-[11px] text-perigo/70 @lg:inline">máx. 5 min</span>
          </div>
          <Button tamanho="icone" variante="escuro" className="size-11 rounded-xl lg:size-11" onClick={() => voz.parar(false)} aria-label="Concluir gravação" title="Concluir e revisar">
            <Square className="fill-current" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {!nota && (
            <>
              <input
                ref={seletor}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  adicionarArquivos(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
              <Button
                tamanho="icone"
                variante="fantasma"
                className="size-11 rounded-xl lg:size-11"
                onClick={() => seletor.current?.click()}
                disabled={enviando}
                aria-label="Anexar foto, vídeo ou arquivo"
                title="Anexar foto, vídeo ou arquivo (ou cole um print com Ctrl+V)"
              >
                <Paperclip />
              </Button>
            </>
          )}
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              const arquivos = Array.from(e.clipboardData.files)
              if (!nota && arquivos.length) {
                e.preventDefault()
                adicionarArquivos(arquivos)
              }
            }}
            onKeyDown={(e) => {
              const toque = window.matchMedia('(pointer: coarse)').matches
              if (e.key === 'Enter' && !e.shiftKey && !toque && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void enviar()
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={nota ? 'Escreva uma nota para a equipe…' : anexos.length ? 'Legenda (opcional)…' : 'Escreva uma mensagem…'}
            aria-label={nota ? 'Nota interna' : 'Mensagem para o cliente'}
            className={cn(
              'max-h-40 min-h-11 flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-[15px] leading-6 outline-none placeholder:text-sutil focus:ring-4',
              nota ? 'border-vip/40 bg-superficie focus:border-vip-700 focus:ring-vip/20' : 'border-linha bg-papel focus:border-ink focus:bg-superficie focus:ring-volt/25',
            )}
          />
          {mostrarMicrofone ? (
            <Button
              tamanho="icone"
              variante="primario"
              className="size-11 rounded-xl lg:size-11"
              onClick={() => void voz.iniciar()}
              disabled={enviando}
              aria-label="Gravar mensagem de voz"
              title="Gravar mensagem de voz"
            >
              <Mic />
            </Button>
          ) : (
            <Button
              variante={nota ? 'escuro' : 'primario'}
              tamanho="icone"
              className="size-11 rounded-xl lg:size-11"
              onClick={() => void enviar()}
              disabled={!podeEnviar || trocandoAssinatura}
              carregando={enviando}
              aria-label={nota ? 'Salvar nota' : 'Enviar'}
              title={nota ? 'Salvar nota' : 'Enviar'}
            >
              {!enviando && (nota ? <StickyNote /> : <SendHorizontal />)}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
