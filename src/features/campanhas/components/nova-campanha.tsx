'use client'

import {
  BookUser,
  CalendarClock,
  Check,
  ClipboardPaste,
  FileSpreadsheet,
  ImagePlus,
  Send,
  ShieldCheck,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'

import { Checkbox, classesControle, Input, Select } from '@/components/form/fields'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  analisarColunas,
  decodificarTexto,
  FORMATOS_ACEITOS,
  lerPlanilhaExcel,
  lerTexto,
  prepararLeads,
  primeiraLinhaEhCabecalho,
  sugerirMapeamento,
  type ColunaPlanilha,
  type Mapeamento,
  type ResumoImportacao,
} from '@/features/leads/planilha'
import { formatarNumero, formatarWhatsapp, plural } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

import { adicionarContatosCampanha, confirmarCampanha, criarCampanha } from '../actions'

import {
  IMAGEM_MAXIMA,
  LIMITES_MENSAGEM,
  TEXTO_BOTAO_SAIR,
  TIPOS_IMAGEM,
  validarMensagem,
  VARIAVEL_NOME,
  type MensagemCampanha,
} from '../mensagem'
import { limiteDiario, rotuloLimite } from '../meta'
import type { ListaParaCampanha } from '../queries'
import { CONTATOS_POR_LOTE } from '../schema'
import { PreviaWhatsapp } from './previa-whatsapp'

const MB = 1024 * 1024
// Listas maiores entram pelo Banco de Leads (importação em lotes) e são escolhidas aqui.
const TAMANHO_MAXIMO = 20 * MB
const EXCEL = ['xlsx', 'xls', 'xlsm', 'ods']
const TEXTO = ['csv', 'txt', 'tsv']
const NOME_EXEMPLO = 'Mariana Costa'
const PRECOS_META = 'https://developers.facebook.com/docs/whatsapp/pricing'

/**
 * Andamento do disparo. O id da campanha nasce aqui: repetir (queda de conexão) cai na mesma
 * campanha. Depois de criada, "Tentar de novo" continua os contatos de onde parou.
 */
type Disparo = {
  executando: boolean
  etapa: string
  erro: string | null
  campanhaId: string | null
  criada: boolean
  imagemPath: string | null
  enviados: number
}

type Origem = 'arquivo' | 'leads' | 'colar'

const ORIGENS: Array<{ chave: Origem; rotulo: string; icone: LucideIcon }> = [
  { chave: 'arquivo', rotulo: 'Enviar arquivo', icone: Upload },
  { chave: 'leads', rotulo: 'Banco de Leads', icone: BookUser },
  { chave: 'colar', rotulo: 'Colar números', icone: ClipboardPaste },
]

type Contato = { nome: string | null; whatsapp: string }
type Leitura = { colunas: ColunaPlanilha[]; mapeamento: Mapeamento; contatos: Contato[]; resumo: ResumoImportacao }

/** Linhas da planilha → contatos com WhatsApp válido, sem repetir. */
function lerContatos(linhas: string[][], mapeamento: Mapeamento | null): Leitura {
  const comCabecalho = primeiraLinhaEhCabecalho(linhas)
  const dados = comCabecalho ? linhas.slice(1) : linhas
  const colunas = analisarColunas(comCabecalho ? linhas[0] : null, dados)
  const mapa = mapeamento ?? sugerirMapeamento(colunas)
  const { leads, resumo } = prepararLeads(dados, colunas, mapa, { somenteComWhatsapp: true })
  const contatos = leads.flatMap((l) => (l.whatsapp ? [{ nome: l.nome, whatsapp: l.whatsapp }] : []))
  return { colunas, mapeamento: mapa, contatos, resumo }
}

function Passo({
  numero,
  titulo,
  descricao,
  feito,
  children,
}: {
  numero: number
  titulo: string
  descricao?: string
  feito: boolean
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader
        titulo={
          <span className="flex items-center gap-2.5">
            <span
              className={cn(
                'tipo-dado grid size-6 place-items-center rounded-full text-[12px]',
                feito ? 'bg-volt text-ink' : 'bg-ink text-white',
              )}
            >
              {feito ? <Check className="size-3.5" aria-label="Concluído" /> : numero}
            </span>
            {titulo}
          </span>
        }
        descricao={descricao}
      />
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Rótulo + controle + erro de um campo controlado no navegador (sem Server Action). */
function Campo({
  label,
  htmlFor,
  erro,
  dica,
  className,
  children,
}: {
  label: string
  htmlFor: string
  erro?: string
  dica?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {erro ? (
        <p className="mt-1.5 text-[13px] font-medium text-perigo">{erro}</p>
      ) : (
        dica && <p className="mt-1.5 text-[13px] text-suave">{dica}</p>
      )}
    </div>
  )
}

function Contador({ atual, maximo }: { atual: number; maximo: number }) {
  return (
    <span className={cn('tipo-dado text-[12px]', atual > maximo ? 'text-perigo' : 'text-sutil')}>
      {formatarNumero(atual)}/{formatarNumero(maximo)}
    </span>
  )
}

function ResumoLeitura({ leitura }: { leitura: Leitura }) {
  const { resumo, contatos } = leitura
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge tom="sucesso" ponto>
          {plural(contatos.length, 'número válido', 'números válidos')}
        </Badge>
        {resumo.duplicados > 0 && (
          <Badge tom="alerta" ponto>
            {plural(resumo.duplicados, 'repetido', 'repetidos')} — recebe só 1 vez
          </Badge>
        )}
        {resumo.ignorados > 0 && (
          <Badge tom="neutro" ponto>
            {plural(resumo.ignorados, 'linha', 'linhas')} sem WhatsApp válido — fica de fora
          </Badge>
        )}
      </div>
      {contatos.length > 0 && (
        <ul className="divide-y divide-linha overflow-hidden rounded-xl border border-linha text-[14px]">
          {contatos.slice(0, 4).map((c) => (
            <li key={c.whatsapp} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate">{c.nome ?? <span className="text-sutil">Sem nome</span>}</span>
              <span className="tipo-dado shrink-0 text-[13px] text-suave">{formatarWhatsapp(c.whatsapp)}</span>
            </li>
          ))}
          {contatos.length > 4 && (
            <li className="px-3 py-2 text-[13px] text-suave">e mais {formatarNumero(contatos.length - 4)}…</li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Nova campanha do WhatsApp oficial: público (arquivo, Banco de Leads ou números
 * colados) → mensagem com prévia → revisão. Ao disparar: foto no Storage, campanha
 * criada, contatos em lotes e mensagem para a análise da Meta. `bloqueio` explica
 * por que o disparo não pode sair (ex.: Meta não conectada); null libera o botão.
 */
export function NovaCampanha({
  listas,
  nomeLoja,
  limiteTier,
  bloqueio,
}: {
  listas: ListaParaCampanha[]
  nomeLoja: string
  limiteTier: string | null
  bloqueio: string | null
}) {
  const router = useRouter()
  // Passo 1 — público
  const [origem, setOrigem] = useState<Origem>('arquivo')
  const [arquivo, setArquivo] = useState<{ nome: string; linhas: string[][] } | null>(null)
  const [mapaArquivo, setMapaArquivo] = useState<Mapeamento | null>(null)
  const [lendo, setLendo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [listaId, setListaId] = useState('')
  const [textoColado, setTextoColado] = useState('')

  // Passo 2 — mensagem
  const [mensagem, setMensagem] = useState<MensagemCampanha>({
    texto: '',
    nomePadrao: 'cliente',
    rodape: '',
    botaoLink: null,
    botaoSair: true,
  })
  const [imagem, setImagem] = useState<{ arquivo: File; url: string } | null>(null)
  const [erroImagem, setErroImagem] = useState<string | null>(null)
  const campoTexto = useRef<HTMLTextAreaElement>(null)

  // Passo 3 — revisão
  const [nome, setNome] = useState('')
  const [quando, setQuando] = useState<'agora' | 'agendar'>('agora')
  const [agendarPara, setAgendarPara] = useState('')
  const [disparo, setDisparo] = useState<Disparo>({
    executando: false,
    etapa: '',
    erro: null,
    campanhaId: null,
    criada: false,
    imagemPath: null,
    enviados: 0,
  })
  const bloqueado = disparo.executando || disparo.criada

  const leituraArquivo = useMemo(() => (arquivo ? lerContatos(arquivo.linhas, mapaArquivo) : null), [arquivo, mapaArquivo])
  const leituraColada = useMemo(() => (textoColado.trim() ? lerContatos(lerTexto(textoColado), null) : null), [textoColado])
  const lista = listas.find((l) => l.id === listaId)
  const pastas = useMemo(() => [...new Set(listas.map((l) => l.pasta))], [listas])

  const leitura = origem === 'arquivo' ? leituraArquivo : origem === 'colar' ? leituraColada : null
  const totalPublico = origem === 'leads' ? (lista?.comWhatsapp ?? 0) : (leitura?.contatos.length ?? 0)
  const descricaoPublico =
    origem === 'leads' ? (lista ? `Lista ${lista.nome} (${lista.pasta})` : '') : origem === 'arquivo' ? (arquivo?.nome ?? '') : 'Números colados'
  const nomeContato = leitura?.contatos.find((c) => c.nome)?.nome ?? NOME_EXEMPLO

  const erros = validarMensagem(mensagem)
  const mensagemPronta = Object.keys(erros).length === 0
  const pendencias = [
    totalPublico === 0 && 'Escolha para quem enviar (passo 1).',
    !mensagemPronta && 'Revise a mensagem (passo 2).',
    !nome.trim() && 'Dê um nome para a campanha.',
    quando === 'agendar' && !agendarPara && 'Escolha a data e a hora do envio.',
  ].filter((p): p is string => Boolean(p))
  const limite = limiteDiario(limiteTier)

  // Libera a URL local da imagem anterior ao trocar (e ao sair da tela).
  useEffect(() => () => {
    if (imagem) URL.revokeObjectURL(imagem.url)
  }, [imagem])

  async function aoEscolherArquivo(file: File | undefined) {
    if (!file) return
    setErroArquivo(null)
    const extensao = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (![...EXCEL, ...TEXTO].includes(extensao)) return setErroArquivo('Formato não suportado. Envie CSV, XLS, XLSX ou TXT.')
    if (file.size > TAMANHO_MAXIMO) {
      return setErroArquivo('Arquivo maior que 20 MB. Importe a lista no Banco de Leads e escolha-a na aba “Banco de Leads”.')
    }
    setLendo(true)
    try {
      const buffer = await file.arrayBuffer()
      const linhas = EXCEL.includes(extensao)
        ? lerPlanilhaExcel(await import('xlsx'), buffer).linhas
        : lerTexto(decodificarTexto(buffer))
      if (linhas.length === 0) throw new Error('Não encontramos linhas com dados nesse arquivo.')
      setArquivo({ nome: file.name, linhas })
      setMapaArquivo(null)
    } catch (erro) {
      console.error(erro)
      setErroArquivo(erro instanceof Error && erro.message ? erro.message : 'Não foi possível ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  function soltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setArrastando(false)
    aoEscolherArquivo(e.dataTransfer.files[0])
  }

  function aoEscolherImagem(file: File | undefined) {
    setErroImagem(null)
    if (!file) return
    if (!TIPOS_IMAGEM.includes(file.type)) return setErroImagem('Use uma foto em JPG ou PNG.')
    if (file.size > IMAGEM_MAXIMA) return setErroImagem('A foto passa de 5 MB (limite da Meta). Reduza e tente de novo.')
    setImagem({ arquivo: file, url: URL.createObjectURL(file) })
    setDisparo((d) => ({ ...d, imagemPath: null }))
  }

  function inserirNome() {
    const campo = campoTexto.current
    const inicio = campo?.selectionStart ?? mensagem.texto.length
    const fim = campo?.selectionEnd ?? inicio
    setMensagem({ ...mensagem, texto: mensagem.texto.slice(0, inicio) + VARIAVEL_NOME + mensagem.texto.slice(fim) })
    requestAnimationFrame(() => {
      campo?.focus()
      campo?.setSelectionRange(inicio + VARIAVEL_NOME.length, inicio + VARIAVEL_NOME.length)
    })
  }

  async function disparar() {
    const parar = (erro: string) => setDisparo((d) => ({ ...d, executando: false, etapa: '', erro }))
    const etapa = (texto: string) => setDisparo((d) => ({ ...d, etapa: texto }))
    const campanhaId = disparo.campanhaId ?? crypto.randomUUID()
    let { imagemPath, enviados } = disparo
    setDisparo((d) => ({ ...d, executando: true, erro: null, campanhaId }))
    try {
      if (!disparo.criada) {
        if (imagem && !imagemPath) {
          etapa('Enviando a foto…')
          const caminho = `${crypto.randomUUID()}.${imagem.arquivo.type === 'image/png' ? 'png' : 'jpg'}`
          const { error } = await createClient().storage.from('campanhas').upload(caminho, imagem.arquivo, { contentType: imagem.arquivo.type })
          if (error) return parar('Não foi possível enviar a foto. Tente de novo.')
          imagemPath = caminho
          setDisparo((d) => ({ ...d, imagemPath: caminho }))
        }
        etapa(origem === 'leads' ? 'Criando a campanha com a lista…' : 'Criando a campanha…')
        const criada = await criarCampanha({
          id: campanhaId,
          nome,
          texto: mensagem.texto,
          nome_padrao: mensagem.nomePadrao,
          rodape: mensagem.rodape,
          botao_texto: mensagem.botaoLink?.texto ?? null,
          botao_url: mensagem.botaoLink?.url ?? null,
          botao_sair: mensagem.botaoSair,
          imagem_path: imagemPath,
          origem,
          origem_descricao: descricaoPublico,
          lista_id: origem === 'leads' ? listaId : null,
          agendada_para: quando === 'agendar' ? new Date(agendarPara).toISOString() : null,
        })
        if (!criada.ok) return parar(criada.mensagem)
        enviados = 0
        setDisparo((d) => ({ ...d, criada: true, enviados: 0 }))
      }

      const contatos = leitura?.contatos ?? []
      while (origem !== 'leads' && enviados < contatos.length) {
        etapa(`Enviando contatos… ${formatarNumero(enviados)} de ${formatarNumero(contatos.length)}`)
        const lote = contatos.slice(enviados, enviados + CONTATOS_POR_LOTE)
        const r = await adicionarContatosCampanha(campanhaId, lote)
        if (!r.ok) return parar(r.mensagem ?? 'Não foi possível enviar os contatos.')
        enviados += lote.length
        setDisparo((d) => ({ ...d, enviados }))
      }

      etapa('Enviando a mensagem para a análise da Meta…')
      const confirmada = await confirmarCampanha(campanhaId)
      if (!confirmada.ok) return parar(confirmada.mensagem ?? 'Não foi possível confirmar a campanha.')
      router.push(`/campanhas/${campanhaId}`)
    } catch {
      parar('A conexão falhou no meio do caminho. Clique em “Tentar de novo” — nada será duplicado.')
    }
  }

  const previa = <PreviaWhatsapp mensagem={mensagem} imagem={imagem?.url ?? null} nomeLoja={nomeLoja} nomeContato={nomeContato} />

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <div className="min-w-0 space-y-5 lg:space-y-6">
        <fieldset disabled={bloqueado} className="min-w-0 space-y-5 lg:space-y-6">
          {/* 1 · Público */}
          <Passo numero={1} titulo="Para quem enviar" descricao="Suba uma lista, escolha uma do Banco de Leads ou cole os números." feito={totalPublico > 0}>
            <div role="tablist" aria-label="Origem dos contatos" className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-linha bg-papel p-1">
              {ORIGENS.map((o) => (
                <button
                  key={o.chave}
                  type="button"
                  role="tab"
                  aria-selected={origem === o.chave}
                  onClick={() => setOrigem(o.chave)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors',
                    origem === o.chave ? 'bg-superficie text-ink shadow-cartao ring-1 ring-linha' : 'text-suave hover:text-ink',
                  )}
                >
                  <o.icone className="size-4 shrink-0 max-sm:hidden" aria-hidden />
                  {o.rotulo}
                </button>
              ))}
            </div>

            {origem === 'arquivo' &&
              (!arquivo ? (
                <label
                  onDragOver={(e) => {
                    e.preventDefault()
                    setArrastando(true)
                  }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={soltar}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                    arrastando ? 'border-volt bg-volt-50' : 'border-linha-forte bg-papel hover:border-ink/40',
                  )}
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-superficie text-ink shadow-cartao">
                    <Upload className="size-5" aria-hidden />
                  </span>
                  <span className="text-[15px] font-semibold">{lendo ? 'Lendo o arquivo…' : 'Arraste a lista aqui ou clique para escolher'}</span>
                  <span className="text-[13px] text-suave">CSV · XLS · XLSX · TXT até 20 MB — com uma coluna de WhatsApp (e, se tiver, de nome)</span>
                  <input type="file" accept={FORMATOS_ACEITOS} className="sr-only" disabled={lendo} onChange={(e) => aoEscolherArquivo(e.target.files?.[0])} />
                </label>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel p-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-superficie shadow-cartao">
                      <FileSpreadsheet className="size-5 text-volt-700" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{arquivo.nome}</p>
                      <p className="text-[13px] text-suave">{plural(arquivo.linhas.length, 'linha', 'linhas')}</p>
                    </div>
                    <Button tamanho="sm" onClick={() => setArquivo(null)}>
                      Trocar arquivo
                    </Button>
                  </div>
                  {leituraArquivo && leituraArquivo.colunas.length > 1 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo label="Coluna do WhatsApp" htmlFor="coluna_whatsapp">
                        <Select
                          name="coluna_whatsapp"
                          value={leituraArquivo.mapeamento.whatsapp ?? ''}
                          onChange={(e) => setMapaArquivo({ ...leituraArquivo.mapeamento, whatsapp: e.target.value || null })}
                        >
                          <option value="">— escolha —</option>
                          {leituraArquivo.colunas.map((c) => (
                            <option key={c.chave} value={c.chave}>
                              {c.rotulo}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                      <Campo label="Coluna do nome" htmlFor="coluna_nome" dica="Usada no {nome} da mensagem.">
                        <Select
                          name="coluna_nome"
                          value={leituraArquivo.mapeamento.nome ?? ''}
                          onChange={(e) => setMapaArquivo({ ...leituraArquivo.mapeamento, nome: e.target.value || null })}
                        >
                          <option value="">— sem nome —</option>
                          {leituraArquivo.colunas.map((c) => (
                            <option key={c.chave} value={c.chave}>
                              {c.rotulo}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                    </div>
                  )}
                  {leituraArquivo && <ResumoLeitura leitura={leituraArquivo} />}
                </div>
              ))}
            {origem === 'arquivo' && erroArquivo && (
              <Alert tom="erro" className="mt-3">
                {erroArquivo}
              </Alert>
            )}

            {origem === 'leads' &&
              (listas.length === 0 ? (
                <div className="rounded-xl bg-papel p-4 text-sm text-suave">
                  Nenhuma lista com WhatsApp no Banco de Leads ainda.{' '}
                  <Link href="/leads/importar" className="font-semibold text-volt-700 hover:text-ink">
                    Importar uma lista
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <Campo label="Lista" htmlFor="lista_id">
                    <Select name="lista_id" value={listaId} onChange={(e) => setListaId(e.target.value)}>
                      <option value="">— escolha uma lista —</option>
                      {pastas.map((pasta) => (
                        <optgroup key={pasta} label={pasta}>
                          {listas
                            .filter((l) => l.pasta === pasta)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.nome} · {formatarNumero(l.comWhatsapp)} com WhatsApp
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </Select>
                  </Campo>
                  {lista && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tom="sucesso" ponto>
                        {plural(lista.comWhatsapp, 'contato com WhatsApp', 'contatos com WhatsApp')}
                      </Badge>
                      <Link href={`/leads/listas/${lista.id}`} className="text-[13px] font-semibold text-volt-700 hover:text-ink">
                        Ver a lista
                      </Link>
                    </div>
                  )}
                </div>
              ))}

            {origem === 'colar' && (
              <div className="space-y-3">
                <Campo label="Números" htmlFor="numeros" dica="Um contato por linha. O nome é opcional — números repetidos entram uma vez só.">
                  <textarea
                    id="numeros"
                    rows={6}
                    value={textoColado}
                    onChange={(e) => setTextoColado(e.target.value)}
                    placeholder={'Mariana Costa, (11) 98765-4321\n(21) 99876-5432'}
                    className={cn(classesControle, 'py-2.5 leading-6')}
                  />
                </Campo>
                {leituraColada && <ResumoLeitura leitura={leituraColada} />}
              </div>
            )}
          </Passo>

          {/* 2 · Mensagem */}
          <Passo
            numero={2}
            titulo="Mensagem"
            descricao="Escreva como se fosse para um cliente só: o {nome} vira o primeiro nome de cada contato."
            feito={mensagemPronta}
          >
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-[13px] font-semibold">Foto (opcional)</p>
                {imagem ? (
                  <div className="flex items-center gap-3 rounded-xl bg-papel p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL local (blob:) da imagem escolhida */}
                    <img src={imagem.url} alt="" className="size-12 rounded-lg object-cover" />
                    <p className="min-w-0 flex-1 truncate text-[14px]">{imagem.arquivo.name}</p>
                    <Button
                      tamanho="icone"
                      variante="fantasma"
                      onClick={() => {
                        setImagem(null)
                        setDisparo((d) => ({ ...d, imagemPath: null }))
                      }}
                      aria-label="Remover foto"
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-linha-forte bg-papel px-3.5 py-3 text-[14px] hover:border-ink/40">
                    <ImagePlus className="size-5 text-suave" aria-hidden />
                    <span>
                      <span className="font-semibold">Adicionar foto</span>
                      <span className="text-suave"> · JPG ou PNG até 5 MB</span>
                    </span>
                    <input type="file" accept={TIPOS_IMAGEM.join(',')} className="sr-only" onChange={(e) => aoEscolherImagem(e.target.files?.[0])} />
                  </label>
                )}
                {erroImagem && <p className="mt-1.5 text-[13px] font-medium text-perigo">{erroImagem}</p>}
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
                  <label htmlFor="texto" className="text-[13px] font-semibold">
                    Texto
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={inserirNome}
                      className="tipo-dado rounded-md bg-volt-50 px-2 py-0.5 text-[12px] text-volt-700 ring-1 ring-volt/30 hover:bg-volt-100"
                    >
                      + {VARIAVEL_NOME}
                    </button>
                    <Contador atual={mensagem.texto.trim().length} maximo={LIMITES_MENSAGEM.texto} />
                  </div>
                </div>
                <textarea
                  id="texto"
                  ref={campoTexto}
                  rows={7}
                  value={mensagem.texto}
                  onChange={(e) => setMensagem({ ...mensagem, texto: e.target.value })}
                  placeholder={'Olá, {nome}! 🍺\n\nChegou o *Drop de Outubro*: 6 rótulos novos, só até domingo.\n\nGaranta o seu pelo botão abaixo.'}
                  aria-invalid={erros.texto && mensagem.texto.trim() ? true : undefined}
                  className={cn(classesControle, 'py-2.5 leading-6')}
                />
                {erros.texto && mensagem.texto.trim() ? (
                  <p className="mt-1.5 text-[13px] font-medium text-perigo">{erros.texto}</p>
                ) : (
                  <p className="mt-1.5 text-[13px] text-suave">
                    Formatação do WhatsApp: <span className="tipo-dado text-[12px]">*negrito*</span> ·{' '}
                    <span className="tipo-dado text-[12px]">_itálico_</span> · <span className="tipo-dado text-[12px]">~riscado~</span>
                  </p>
                )}
              </div>

              {mensagem.texto.includes(VARIAVEL_NOME) && (
                <Campo label="Quando o contato não tem nome, usar" htmlFor="nome_padrao" erro={erros.nomePadrao} dica="Ex.: “Olá, cliente!”">
                  <Input
                    name="nome_padrao"
                    value={mensagem.nomePadrao}
                    maxLength={30}
                    onChange={(e) => setMensagem({ ...mensagem, nomePadrao: e.target.value })}
                    aria-invalid={erros.nomePadrao ? true : undefined}
                  />
                </Campo>
              )}

              <Campo
                label="Rodapé (opcional)"
                htmlFor="rodape"
                erro={erros.rodape}
                dica={<Contador atual={mensagem.rodape.length} maximo={LIMITES_MENSAGEM.rodape} />}
              >
                <Input
                  name="rodape"
                  value={mensagem.rodape}
                  placeholder="Ex.: Cerveja Lenta · Delivery em SP"
                  onChange={(e) => setMensagem({ ...mensagem, rodape: e.target.value })}
                  aria-invalid={erros.rodape ? true : undefined}
                />
              </Campo>

              <div className="space-y-3 rounded-xl border border-linha p-3.5">
                <Checkbox
                  label="Botão com link"
                  descricao="Leva o cliente direto para a loja, a pré-venda ou o Grupo VIP."
                  checked={mensagem.botaoLink !== null}
                  onChange={(e) => setMensagem({ ...mensagem, botaoLink: e.target.checked ? { texto: 'Ver ofertas', url: '' } : null })}
                />
                {mensagem.botaoLink && (
                  <div className="grid gap-3 pl-[30px] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <Campo label="Texto do botão" htmlFor="botao_texto" erro={erros.botaoTexto}>
                      <Input
                        name="botao_texto"
                        value={mensagem.botaoLink.texto}
                        maxLength={LIMITES_MENSAGEM.botao}
                        onChange={(e) => setMensagem({ ...mensagem, botaoLink: { texto: e.target.value, url: mensagem.botaoLink?.url ?? '' } })}
                        aria-invalid={erros.botaoTexto ? true : undefined}
                      />
                    </Campo>
                    <Campo label="Link" htmlFor="botao_url" erro={mensagem.botaoLink.url.trim() ? erros.botaoUrl : undefined}>
                      <Input
                        name="botao_url"
                        type="url"
                        inputMode="url"
                        value={mensagem.botaoLink.url}
                        placeholder="https://"
                        onChange={(e) => setMensagem({ ...mensagem, botaoLink: { texto: mensagem.botaoLink?.texto ?? '', url: e.target.value } })}
                        aria-invalid={erros.botaoUrl && mensagem.botaoLink.url.trim() ? true : undefined}
                      />
                    </Campo>
                  </div>
                )}
                <Checkbox
                  label={`Botão “${TEXTO_BOTAO_SAIR}”`}
                  descricao="Recomendado: quem não quer mais receber sai da lista em vez de bloquear ou denunciar o número."
                  checked={mensagem.botaoSair}
                  onChange={(e) => setMensagem({ ...mensagem, botaoSair: e.target.checked })}
                />
              </div>

              <div className="lg:hidden">
                <p className="tipo-rotulo mb-2 text-suave">Prévia</p>
                {previa}
              </div>

              <Alert tom="info">
                Toda mensagem nova passa pela análise da Meta antes do primeiro envio — costuma levar de alguns minutos a poucas horas.
              </Alert>
            </div>
          </Passo>

          {/* 3 · Revisão */}
          <Passo numero={3} titulo="Revisar e disparar" feito={false}>
            <div className="space-y-5">
              <Campo label="Nome da campanha" htmlFor="campanha_nome" dica="Só para você encontrar depois — o cliente não vê.">
                <Input name="campanha_nome" value={nome} maxLength={80} placeholder="Ex.: Drop de Outubro" onChange={(e) => setNome(e.target.value)} />
              </Campo>

              <fieldset>
                <legend className="mb-1.5 text-[13px] font-semibold">Quando enviar</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { valor: 'agora', titulo: 'Agora', descricao: 'Começa assim que a Meta aprovar a mensagem.', icone: Send },
                      { valor: 'agendar', titulo: 'Agendar', descricao: 'Escolha o dia e a hora.', icone: CalendarClock },
                    ] as const
                  ).map((o) => (
                    <label
                      key={o.valor}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                        quando === o.valor ? 'border-ink bg-papel' : 'border-linha hover:border-linha-forte',
                      )}
                    >
                      <input
                        type="radio"
                        name="quando"
                        value={o.valor}
                        checked={quando === o.valor}
                        onChange={() => setQuando(o.valor)}
                        className="mt-1 size-4 accent-[#0a0e14]"
                      />
                      <span>
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <o.icone className="size-4" aria-hidden /> {o.titulo}
                        </span>
                        <span className="block text-[13px] text-suave">{o.descricao}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {quando === 'agendar' && (
                  <Input
                    name="agendar_para"
                    type="datetime-local"
                    aria-label="Data e hora do envio"
                    value={agendarPara}
                    onChange={(e) => setAgendarPara(e.target.value)}
                    className="mt-2 sm:max-w-xs"
                  />
                )}
              </fieldset>

              <dl className="grid gap-3 rounded-xl bg-papel p-4 text-[14px] sm:grid-cols-2">
                <div>
                  <dt className="tipo-rotulo text-suave">Público</dt>
                  <dd className="mt-0.5 font-semibold">{totalPublico > 0 ? plural(totalPublico, 'contato', 'contatos') : '—'}</dd>
                  {totalPublico > 0 && <dd className="truncate text-[13px] text-suave">{descricaoPublico}</dd>}
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Mensagem</dt>
                  <dd className="mt-0.5 font-semibold">{mensagemPronta ? 'Pronta' : 'Incompleta'}</dd>
                  <dd className="text-[13px] text-suave">Vai para a análise da Meta</dd>
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Limite por dia</dt>
                  <dd className="mt-0.5 font-semibold">{limiteTier ? rotuloLimite(limiteTier) : '—'}</dd>
                  <dd className="text-[13px] text-suave">
                    {limite !== null && totalPublico > limite
                      ? `Saem até ${formatarNumero(limite)} por dia; o resto continua sozinho nos dias seguintes.`
                      : 'Números novos começam com 250 por dia; a Meta aumenta conforme a qualidade.'}
                  </dd>
                </div>
                <div>
                  <dt className="tipo-rotulo text-suave">Custo</dt>
                  <dd className="mt-0.5 text-[13px] text-suave">
                    A Meta cobra por mensagem de marketing entregue.{' '}
                    <a href={PRECOS_META} target="_blank" rel="noopener noreferrer" className="font-semibold text-volt-700 hover:text-ink">
                      Ver tabela de preços
                    </a>
                  </dd>
                </div>
              </dl>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
                  <ShieldCheck className="size-4 text-sucesso" aria-hidden /> Como o disparo protege o seu número
                </p>
                <ul className="space-y-1 text-[13px] text-suave">
                  <li>• Números repetidos e inválidos ficam de fora.</li>
                  <li>• Quem tocar em “{TEXTO_BOTAO_SAIR}” não recebe as próximas campanhas.</li>
                  <li>• O envio respeita o limite diário do número e continua no dia seguinte, se precisar.</li>
                </ul>
              </div>

              <p className="text-[13px] text-suave">
                Quer conferir antes? Agende a campanha e, assim que a Meta aprovar, mande um teste para o seu WhatsApp pela página dela.
              </p>
            </div>
          </Passo>
        </fieldset>

        <div className="space-y-3 rounded-cartao border border-linha bg-superficie p-4 shadow-cartao lg:p-5">
          {(pendencias.length > 0 || bloqueio) && (
            <Alert tom="alerta" titulo="Antes de disparar">
              <ul className="mt-0.5 space-y-0.5">
                {pendencias.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
                {bloqueio && (
                  <li>
                    • {bloqueio}{' '}
                    <Link href="/configuracoes/whatsapp-oficial" className="font-semibold underline underline-offset-2">
                      Ver o passo a passo
                    </Link>
                  </li>
                )}
              </ul>
            </Alert>
          )}

          {disparo.erro && <Alert tom="erro">{disparo.erro}</Alert>}

          <div className="flex flex-wrap items-center justify-end gap-3 *:grow sm:*:grow-0">
            {disparo.etapa && <p className="text-[13px] text-suave sm:mr-auto">{disparo.etapa}</p>}
            <Button
              variante="primario"
              tamanho="lg"
              carregando={disparo.executando}
              disabled={pendencias.length > 0 || Boolean(bloqueio)}
              onClick={disparar}
            >
              {quando === 'agendar' ? <CalendarClock /> : <Send />}
              {disparo.campanhaId ? 'Tentar de novo' : quando === 'agendar' ? 'Agendar campanha' : 'Disparar campanha'}
              {!disparo.campanhaId && totalPublico > 0 && ` · ${formatarNumero(totalPublico)}`}
            </Button>
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-8 space-y-2">
          <p className="tipo-rotulo text-suave">Prévia no WhatsApp</p>
          {previa}
          <p className="text-[12px] text-sutil">Exemplo para {nomeContato.split(' ')[0]}.</p>
        </div>
      </aside>
    </div>
  )
}
