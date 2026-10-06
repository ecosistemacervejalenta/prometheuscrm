'use client'

import { Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type DragEvent } from 'react'

import { Checkbox, Field, Input, Select } from '@/components/form/fields'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatarNumero, formatarWhatsapp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { normalizarWhatsapp, whatsappValido } from '@/lib/whatsapp'

import { concluirImportacao, importarLote, iniciarImportacao } from '../actions'
import {
  analisarColunas,
  decodificarTexto,
  FORMATOS_ACEITOS,
  lerPlanilhaExcel,
  lerTexto,
  nomeDaListaPeloArquivo,
  prepararLeads,
  primeiraLinhaEhCabecalho,
  sugerirMapeamento,
  type LeadImportacao,
  type Mapeamento,
} from '../planilha'
import { ICONE_TIPO } from './icones'

const MB = 1024 * 1024
// Limites pensados na memória do navegador (o arquivo é lido inteiro antes de enviar):
// ~750 mil linhas de CSV ou ~600 mil de Excel ficam perto de 2 GB, com folga para a aba.
const TAMANHO_MAXIMO_TEXTO = 100 * MB
const TAMANHO_MAXIMO_EXCEL = 60 * MB
// Até 2.000 leads por envio, sem passar de ~1,2 milhão de caracteres (limite da Vercel: 4,5 MB por requisição).
const LOTE = 2000
const LOTE_CARACTERES = 1_200_000
const NOVA_PASTA = '__nova__'
const ORIGENS = ['WhatsApp', 'Instagram', 'Site', 'Evento', 'Indicação', 'Outro']
const EXCEL = ['xlsx', 'xls', 'xlsm', 'ods']
const TEXTO = ['csv', 'txt', 'tsv']


type Arquivo = { nome: string; tamanho: number; linhas: string[][]; abas: string[]; aba: string | null; buffer: ArrayBuffer | null }
type Envio = { listaId: string | null; enviados: number; erro: string | null; executando: boolean }

/** Onde termina o lote que começa em `inicio` (linhas com muitas colunas formam lotes menores). */
function fimDoLote(leads: LeadImportacao[], inicio: number) {
  let fim = inicio
  let caracteres = 0
  while (fim < leads.length && fim - inicio < LOTE) {
    caracteres += JSON.stringify(leads[fim]).length
    if (caracteres > LOTE_CARACTERES && fim > inicio) break
    fim++
  }
  return fim
}

function baixarModelo() {
  const conteudo = '﻿Nome;WhatsApp;E-mail;Cidade\r\nJoão Silva;(11) 98765-4321;joao@email.com;São Paulo\r\n'
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: 'modelo-lista-de-leads.csv' })
  link.click()
  URL.revokeObjectURL(url)
}

function Passo({ numero, titulo, descricao, children }: { numero: number; titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        titulo={
          <span className="flex items-center gap-2.5">
            <span className="tipo-dado grid size-6 place-items-center rounded-full bg-ink text-[12px] text-white">{numero}</span>
            {titulo}
          </span>
        }
        descricao={descricao}
      />
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Importação de lista de leads (CSV, XLS/XLSX, TXT): lê no navegador, mostra a prévia e envia em lotes. */
export function ImportadorLeads({ pastas, pastaInicial }: { pastas: Array<{ id: string; nome: string }>; pastaInicial?: string }) {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<Arquivo | null>(null)
  const [lendo, setLendo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [rotulos, setRotulos] = useState<Record<string, string>>({})
  const [mapeamento, setMapeamento] = useState<Mapeamento>({ nome: null, whatsapp: null, email: null })
  const [somenteComWhatsapp, setSomenteComWhatsapp] = useState(false)
  const [pastaId, setPastaId] = useState(pastaInicial && pastas.some((p) => p.id === pastaInicial) ? pastaInicial : (pastas[0]?.id ?? NOVA_PASTA))
  const [novaPasta, setNovaPasta] = useState('')
  const [nomeLista, setNomeLista] = useState('')
  const [origem, setOrigem] = useState('WhatsApp')
  const [envio, setEnvio] = useState<Envio>({ listaId: null, enviados: 0, erro: null, executando: false })

  const cabecalho = arquivo && temCabecalho ? arquivo.linhas[0] : null
  const dados = useMemo(() => (arquivo ? (temCabecalho ? arquivo.linhas.slice(1) : arquivo.linhas) : []), [arquivo, temCabecalho])
  const colunasDetectadas = useMemo(() => analisarColunas(cabecalho, dados), [cabecalho, dados])
  const colunas = colunasDetectadas.map((c) => ({ ...c, rotulo: rotulos[c.chave]?.trim() || c.rotulo }))
  const preparo = useMemo(
    () => prepararLeads(dados, colunasDetectadas, mapeamento, { somenteComWhatsapp }),
    [dados, colunasDetectadas, mapeamento, somenteComWhatsapp],
  )
  const bloqueado = envio.executando || envio.listaId !== null

  function carregar(base: Arquivo, cabecalhoInicial?: boolean) {
    const comCabecalho = cabecalhoInicial ?? primeiraLinhaEhCabecalho(base.linhas)
    setArquivo(base)
    setTemCabecalho(comCabecalho)
    setRotulos({})
    setMapeamento(sugerirMapeamento(analisarColunas(comCabecalho ? base.linhas[0] : null, comCabecalho ? base.linhas.slice(1) : base.linhas)))
  }

  async function aoEscolher(file: File | undefined) {
    if (!file) return
    setErroLeitura(null)
    const extensao = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (![...EXCEL, ...TEXTO].includes(extensao)) return setErroLeitura('Formato não suportado. Envie CSV, XLS, XLSX ou TXT.')
    if (EXCEL.includes(extensao) && file.size > TAMANHO_MAXIMO_EXCEL) {
      return setErroLeitura('Planilha do Excel maior que 60 MB. No Excel, use Arquivo › Salvar como › CSV e importe o CSV (até 100 MB), ou divida a lista em partes.')
    }
    if (file.size > TAMANHO_MAXIMO_TEXTO) return setErroLeitura('Arquivo maior que 100 MB. Divida a lista em partes.')
    setLendo(true)
    try {
      const buffer = await file.arrayBuffer()
      let base: Arquivo
      if (EXCEL.includes(extensao)) {
        const planilha = lerPlanilhaExcel(await import('xlsx'), buffer)
        base = { nome: file.name, tamanho: file.size, linhas: planilha.linhas, abas: planilha.abas, aba: planilha.aba, buffer }
      } else {
        base = { nome: file.name, tamanho: file.size, linhas: lerTexto(decodificarTexto(buffer)), abas: [], aba: null, buffer: null }
      }
      if (base.linhas.length === 0) throw new Error('Não encontramos linhas com dados nesse arquivo.')
      carregar(base)
      setNomeLista(nomeDaListaPeloArquivo(file.name))
    } catch (erro) {
      console.error(erro)
      setErroLeitura(erro instanceof Error && erro.message ? erro.message : 'Não foi possível ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  async function trocarAba(aba: string) {
    if (!arquivo?.buffer) return
    const planilha = lerPlanilhaExcel(await import('xlsx'), arquivo.buffer, aba)
    carregar({ ...arquivo, linhas: planilha.linhas, aba: planilha.aba })
  }

  function soltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setArrastando(false)
    if (!bloqueado) aoEscolher(e.dataTransfer.files[0])
  }

  async function importar() {
    if (!arquivo || preparo.leads.length === 0) return
    const leads = preparo.leads
    setEnvio((e) => ({ ...e, executando: true, erro: null }))
    const parar = (erro: string, listaId: string | null, enviados: number) => setEnvio({ listaId, enviados, erro, executando: false })
    let listaId = envio.listaId
    let i = envio.enviados
    try {
      if (!listaId) {
        const inicio = await iniciarImportacao({
          pasta_id: pastaId === NOVA_PASTA ? null : pastaId,
          nova_pasta: pastaId === NOVA_PASTA ? novaPasta : null,
          nome: nomeLista,
          origem,
          arquivo_nome: arquivo.nome,
          colunas,
          coluna_nome: mapeamento.nome,
          coluna_whatsapp: mapeamento.whatsapp,
          coluna_email: mapeamento.email,
        })
        if (!inicio.ok) return parar(inicio.mensagem, null, 0)
        listaId = inicio.listaId
      }
      while (i < leads.length) {
        const fim = fimDoLote(leads, i)
        const lote = await importarLote(listaId, leads.slice(i, fim))
        if (!lote.ok) return parar(lote.mensagem, listaId, i)
        i = fim
        setEnvio({ listaId, enviados: i, erro: null, executando: true })
      }
      const fim = await concluirImportacao(listaId)
      if (!fim.ok) return parar(fim.mensagem, listaId, leads.length)
      router.push(`/leads/listas/${listaId}`)
    } catch {
      parar('A conexão falhou no meio do envio. Clique em “Tentar de novo” — nada será duplicado.', listaId, i)
    }
  }

  const progresso = preparo.leads.length ? Math.round((envio.enviados / preparo.leads.length) * 100) : 0
  const amostra = dados.slice(0, 8)
  const opcoesColuna = (
    <>
      <option value="">— nenhuma —</option>
      {colunas.map((c) => (
        <option key={c.chave} value={c.chave}>
          {c.rotulo}
        </option>
      ))}
    </>
  )

  return (
    <div className="space-y-5 lg:space-y-6">
      <Passo numero={1} titulo="Arquivo" descricao="CSV ou TXT até 100 MB, Excel (XLS/XLSX) até 60 MB. Lido no seu navegador antes de enviar.">
        {!arquivo ? (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setArrastando(true)
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={soltar}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                arrastando ? 'border-volt bg-volt-50' : 'border-linha-forte bg-papel hover:border-ink/40',
              )}
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-superficie text-ink shadow-cartao">
                <Upload className="size-5" aria-hidden />
              </span>
              <span className="text-[15px] font-semibold">{lendo ? 'Lendo o arquivo…' : 'Arraste o arquivo aqui ou clique para escolher'}</span>
              <span className="text-[13px] text-suave">CSV · XLS · XLSX · TXT</span>
              <input type="file" accept={FORMATOS_ACEITOS} className="sr-only" disabled={lendo} onChange={(e) => aoEscolher(e.target.files?.[0])} />
            </label>
            <button type="button" onClick={baixarModelo} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-volt-700 hover:text-ink">
              <Download className="size-3.5" aria-hidden /> Baixar um modelo CSV
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel p-3">
            <span className="grid size-10 place-items-center rounded-xl bg-superficie shadow-cartao">
              <FileSpreadsheet className="size-5 text-volt-700" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{arquivo.nome}</p>
              <p className="text-[13px] text-suave">
                {formatarNumero(dados.length)} linha(s) · {(arquivo.tamanho / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB
              </p>
            </div>
            {arquivo.abas.length > 1 && (
              <Select aria-label="Aba da planilha" value={arquivo.aba ?? ''} onChange={(e) => trocarAba(e.target.value)} disabled={bloqueado} className="w-auto">
                {arquivo.abas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            )}
            <Button tamanho="sm" onClick={() => setArquivo(null)} disabled={bloqueado}>
              Trocar arquivo
            </Button>
          </div>
        )}
        {erroLeitura && (
          <Alert tom="erro" className="mt-3">
            {erroLeitura}
          </Alert>
        )}
      </Passo>

      {arquivo && (
        <Passo numero={2} titulo="Colunas" descricao="Confira a prévia, renomeie as colunas se quiser e indique onde estão o nome e o WhatsApp.">
          <div className="space-y-4">
            <Checkbox
              label="A primeira linha é o cabeçalho (nomes das colunas)"
              checked={temCabecalho}
              disabled={bloqueado}
              onChange={(e) => carregar(arquivo, e.target.checked)}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Coluna do nome" name="map_nome">
                <Select name="map_nome" value={mapeamento.nome ?? ''} disabled={bloqueado} onChange={(e) => setMapeamento({ ...mapeamento, nome: e.target.value || null })}>
                  {opcoesColuna}
                </Select>
              </Field>
              <Field label="Coluna do WhatsApp" name="map_whatsapp">
                <Select name="map_whatsapp" value={mapeamento.whatsapp ?? ''} disabled={bloqueado} onChange={(e) => setMapeamento({ ...mapeamento, whatsapp: e.target.value || null })}>
                  {opcoesColuna}
                </Select>
              </Field>
              <Field label="Coluna do e-mail" name="map_email">
                <Select name="map_email" value={mapeamento.email ?? ''} disabled={bloqueado} onChange={(e) => setMapeamento({ ...mapeamento, email: e.target.value || null })}>
                  {opcoesColuna}
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tom="neutro">{formatarNumero(preparo.resumo.linhas)} linhas com dados</Badge>
              <Badge tom="sucesso" ponto>
                {formatarNumero(preparo.resumo.comWhatsapp)} com WhatsApp válido
              </Badge>
              {preparo.resumo.duplicados > 0 && (
                <Badge tom="alerta" ponto>
                  {formatarNumero(preparo.resumo.duplicados)} número(s) repetido(s) — entram só 1 vez
                </Badge>
              )}
              {preparo.resumo.semWhatsapp + preparo.resumo.ignorados > 0 && (
                <Badge tom="neutro" ponto>
                  {formatarNumero(preparo.resumo.semWhatsapp + preparo.resumo.ignorados)} sem WhatsApp válido
                  {somenteComWhatsapp ? ' — não entram' : ''}
                </Badge>
              )}
            </div>
            {!mapeamento.whatsapp && (
              <Alert tom="alerta">Nenhuma coluna de WhatsApp escolhida: a lista será importada, mas sem números para disparos.</Alert>
            )}
            <Checkbox
              label="Importar só quem tem WhatsApp válido"
              descricao="Linhas sem número (ou com número inválido) ficam de fora."
              checked={somenteComWhatsapp}
              disabled={bloqueado}
              onChange={(e) => setSomenteComWhatsapp(e.target.checked)}
            />

            <div className="overflow-hidden rounded-xl border border-linha">
              <Table>
                <THead>
                  <TR>
                    {colunas.map((c) => {
                      const Icone = ICONE_TIPO[c.tipo]
                      return (
                        <TH key={c.chave} className="min-w-40 align-bottom">
                          <span className="mb-1 flex items-center gap-1 text-suave">
                            <Icone className="size-3.5" aria-hidden />
                            {c.chave === mapeamento.whatsapp ? 'WhatsApp' : c.chave === mapeamento.nome ? 'Nome' : c.chave === mapeamento.email ? 'E-mail' : c.tipo}
                          </span>
                          <Input
                            aria-label={`Nome da coluna ${c.rotulo}`}
                            value={rotulos[c.chave] ?? c.rotulo}
                            maxLength={120}
                            disabled={bloqueado}
                            onChange={(e) => setRotulos({ ...rotulos, [c.chave]: e.target.value })}
                            className="h-9 font-sans text-[13px] font-semibold tracking-normal normal-case"
                          />
                        </TH>
                      )
                    })}
                  </TR>
                </THead>
                <TBody>
                  {amostra.map((linha, i) => (
                    <TR key={i}>
                      {colunas.map((c) => {
                        const valor = linha[Number(c.chave.slice(1))] ?? ''
                        const ehWhatsapp = c.chave === mapeamento.whatsapp && valor
                        return (
                          <TD key={c.chave} className={cn('text-[13px]', c.chave === mapeamento.nome && 'font-semibold')}>
                            {ehWhatsapp ? (
                              whatsappValido(valor) ? (
                                <span className="tipo-dado">{formatarWhatsapp(normalizarWhatsapp(valor))}</span>
                              ) : (
                                <span className="text-suave">
                                  {valor} <Badge tom="perigo">inválido</Badge>
                                </span>
                              )
                            ) : (
                              valor || <span className="text-sutil">—</span>
                            )}
                          </TD>
                        )
                      })}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            {dados.length > amostra.length && (
              <p className="text-[13px] text-suave">Prévia das primeiras {amostra.length} linhas de {formatarNumero(dados.length)}.</p>
            )}
          </div>
        </Passo>
      )}

      {arquivo && (
        <Passo numero={3} titulo="Destino" descricao="Em qual pasta a lista fica e como ela vai se chamar.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pasta" name="pasta">
              <Select name="pasta" value={pastaId} disabled={bloqueado} onChange={(e) => setPastaId(e.target.value)}>
                {pastas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
                <option value={NOVA_PASTA}>+ Nova pasta…</option>
              </Select>
              {pastaId === NOVA_PASTA && (
                <Input
                  name="nova_pasta"
                  aria-label="Nome da nova pasta"
                  placeholder="Ex.: Central da Cerveja"
                  value={novaPasta}
                  maxLength={80}
                  disabled={bloqueado}
                  onChange={(e) => setNovaPasta(e.target.value)}
                  className="mt-2"
                />
              )}
            </Field>
            <Field label="Nome da lista" name="nome_lista">
              <Input name="nome_lista" value={nomeLista} maxLength={120} disabled={bloqueado} onChange={(e) => setNomeLista(e.target.value)} placeholder="Ex.: Grupo VIP" />
            </Field>
            <Field label="Origem" name="origem" dica="De onde vieram esses contatos.">
              <Input name="origem" list="origens-lead" value={origem} maxLength={60} disabled={bloqueado} onChange={(e) => setOrigem(e.target.value)} />
              <datalist id="origens-lead">
                {ORIGENS.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </Field>
          </div>

          {envio.erro && (
            <Alert tom="erro" className="mt-4">
              {envio.erro}
            </Alert>
          )}
          {(envio.executando || envio.enviados > 0) && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[13px] text-suave">
                <span>Enviando leads… mantenha esta aba aberta até terminar.</span>
                <span className="tipo-dado">
                  {formatarNumero(envio.enviados)} / {formatarNumero(preparo.leads.length)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-papel" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-volt transition-[width]" style={{ width: `${progresso}%` }} />
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {preparo.leads.length === 0 && <span className="text-[13px] text-suave">Nenhum lead para importar com essas opções.</span>}
            <Button
              variante="primario"
              carregando={envio.executando}
              disabled={preparo.leads.length === 0 || !nomeLista.trim() || (pastaId === NOVA_PASTA && !novaPasta.trim())}
              onClick={importar}
            >
              {envio.erro ? (
                <>
                  <RotateCcw /> Tentar de novo
                </>
              ) : (
                <>
                  <Upload /> Importar {formatarNumero(preparo.leads.length)} lead(s)
                </>
              )}
            </Button>
          </div>
        </Passo>
      )}
    </div>
  )
}
