import { normalizarWhatsapp, whatsappValido } from '@/lib/whatsapp'

/**
 * Leitura e análise de listas de leads (CSV, TXT, XLS/XLSX) — funções puras,
 * executadas no navegador (prévia instantânea) e testáveis no Node.
 */

export type TipoColuna = 'nome' | 'telefone' | 'email' | 'texto'
export type ColunaPlanilha = { chave: string; rotulo: string; tipo: TipoColuna }
export type Mapeamento = { nome: string | null; whatsapp: string | null; email: string | null }
export type LeadImportacao = {
  linha: number
  nome: string | null
  whatsapp: string | null
  email: string | null
  dados: Record<string, string>
}
export type ResumoImportacao = { linhas: number; comWhatsapp: number; semWhatsapp: number; duplicados: number; ignorados: number }

export const MAX_COLUNAS = 60
export const MAX_TAMANHO_CELULA = 500
export const FORMATOS_ACEITOS = '.csv,.txt,.tsv,.xls,.xlsx,.xlsm,.ods'

// Caracteres invisíveis que o WhatsApp e o Excel colocam em nomes e números
// (marcas de direção, espaço sem quebra, hífen não separável...).
const INVISIVEIS = /[​-‏‪-‮⁠-⁩﻿]/g

export function limparCelula(valor: unknown): string {
  return String(valor ?? '')
    .replace(INVISIVEIS, '')
    .replace(/[   ]/g, ' ')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAMANHO_CELULA)
}

export function pareceTelefone(valor: string): boolean {
  const v = valor.trim()
  return /^\+?[\d\s().-]+$/.test(v) && whatsappValido(v)
}

export function pareceEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim())
}

const pareceNome = (valor: string) => /[a-zA-ZÀ-ÿ]/.test(valor) && !/[@\d]{3,}/.test(valor) && !pareceEmail(valor)

/** Texto do arquivo: UTF-16 (BOM), UTF-8 ou — se não for UTF-8 válido — Windows-1252 (Excel no Windows). */
export function decodificarTexto(bytes: ArrayBuffer | Uint8Array): string {
  const dados = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (dados[0] === 0xff && dados[1] === 0xfe) return new TextDecoder('utf-16le').decode(dados).replace(/^﻿/, '')
  if (dados[0] === 0xfe && dados[1] === 0xff) return new TextDecoder('utf-16be').decode(dados).replace(/^﻿/, '')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(dados).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(dados)
  }
}

/** Texto delimitado (padrão CSV: aspas, aspas duplicadas e quebras de linha dentro de aspas). */
export function lerDelimitado(texto: string, delimitador: string): string[][] {
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let entreAspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else entreAspas = false
      } else campo += c
    } else if (c === '"' && campo.trim() === '') {
      entreAspas = true
      campo = ''
    } else if (c === delimitador) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas.map((l) => l.map(limparCelula)).filter((l) => l.some((v) => v !== ''))
}

/** Separador mais provável (tab, ponto e vírgula, vírgula ou barra) — ou null se o texto não tem colunas. */
export function detectarDelimitador(texto: string): string | null {
  const amostra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40).join('\n')
  let melhor: { delimitador: string; pontos: number } | null = null
  for (const delimitador of ['\t', ';', ',', '|']) {
    const contagens = lerDelimitado(amostra, delimitador).map((l) => l.length)
    if (contagens.length === 0) continue
    const frequencia = new Map<number, number>()
    for (const c of contagens) frequencia.set(c, (frequencia.get(c) ?? 0) + 1)
    const [moda, vezes] = [...frequencia.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    if (moda < 2) continue
    const consistencia = vezes / contagens.length
    const pontos = consistencia * 100 + Math.min(moda, 20)
    if (consistencia >= 0.6 && (!melhor || pontos > melhor.pontos)) melhor = { delimitador, pontos }
  }
  return melhor?.delimitador ?? null
}

/**
 * CSV/TXT → linhas. Com separador, lê as colunas; sem separador (um contato por
 * linha, ex.: "João Silva - +55 11 98765-4321"), separa o telefone do nome.
 */
export function lerTexto(texto: string): string[][] {
  const delimitador = detectarDelimitador(texto)
  if (delimitador) return lerDelimitado(texto, delimitador)
  return texto
    .split(/\r?\n/)
    .map(limparCelula)
    .filter(Boolean)
    .map((linha) => {
      const achado = linha.match(/\+?\(?\d[\d\s().-]{7,}\d/)
      if (!achado || !pareceTelefone(achado[0])) return [linha]
      const resto = (linha.slice(0, achado.index) + ' ' + linha.slice(achado.index! + achado[0].length))
        .replace(/[-:|,;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return [resto, achado[0].trim()]
    })
}

type ModuloXlsx = typeof import('xlsx')

/** Planilha do Excel (XLS, XLSX, ODS) → abas e linhas da aba escolhida (ou da 1ª aba com dados). */
export function lerPlanilhaExcel(xlsx: ModuloXlsx, dados: ArrayBuffer, aba?: string) {
  const pasta = xlsx.read(dados, { type: 'array', cellDates: true, dense: true })
  const linhasDa = (nome: string) =>
    xlsx.utils
      .sheet_to_json<unknown[]>(pasta.Sheets[nome], { header: 1, raw: true, defval: '', blankrows: false })
      .map((linha) =>
        linha.map((v) => {
          // Telefones gravados como número: inteiro sem notação científica (5.51199E+12 → 5511987654321).
          if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v).replace('.', ',')
          if (v instanceof Date) return v.toISOString().slice(0, 10).split('-').reverse().join('/')
          return limparCelula(v)
        }),
      )
      .filter((l) => l.some((v) => v !== ''))
  const abas = pasta.SheetNames
  if (aba && abas.includes(aba)) return { abas, aba, linhas: linhasDa(aba) }
  // Cada aba é convertida uma vez só (em planilhas grandes, converter de novo dobra o tempo e a memória).
  for (const nome of abas) {
    const linhas = linhasDa(nome)
    if (linhas.length > 0) return { abas, aba: nome, linhas }
  }
  return { abas, aba: abas[0] ?? null, linhas: [] }
}

/** A 1ª linha é cabeçalho se tem texto e nenhum telefone, e-mail ou número. */
export function primeiraLinhaEhCabecalho(linhas: string[][]): boolean {
  const [primeira] = linhas
  if (!primeira || linhas.length < 2) return false
  const temDado = primeira.some((v) => pareceTelefone(v) || pareceEmail(v) || /^\d+([.,]\d+)?$/.test(v))
  return !temDado && primeira.some((v) => /[a-zA-ZÀ-ÿ]/.test(v))
}

const sem = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Palavra no início do rótulo ou depois de separador: "DSC_NOME_CLIENTE" tem "nome", "NUM_ANOMES" não.
const temPalavra = (rotulo: string, palavras: string) => new RegExp(`(^|[^a-z])(${palavras})`).test(rotulo)
const dicaDoCabecalho = (rotulo: string): TipoColuna | 'documento' | null => {
  const r = sem(rotulo)
  // CPF (11 dígitos), CNPJ, CEP e códigos parecem telefone, mas não são.
  if (temPalavra(r, 'cpf|cnpj|documento|doc[^a-z]|rg[^a-z]|rg$|cep|contrato|protocolo|codigo|cod[^a-z]|id[^a-z]|id$')) return 'documento'
  if (/(whats|celular|telefone|fone|phone|numero|contato tel)/.test(r)) return 'telefone'
  if (/mail/.test(r)) return 'email'
  if (temPalavra(r, 'nome|name|contato|cliente|usuario|participante')) return 'nome'
  return null
}
// Entre várias colunas de telefone, a de celular/WhatsApp é a melhor para os disparos.
const pareceCelular = (rotulo: string) => /(whats|zap|cel|movel|mobile)/.test(sem(rotulo))

/** Colunas da lista (rótulo + tipo detectado pelos valores). Colunas totalmente vazias são descartadas. */
export function analisarColunas(cabecalho: string[] | null, dados: string[][]): ColunaPlanilha[] {
  // Laço em vez de Math.max(...linhas): com centenas de milhares de linhas o spread estoura a pilha.
  const largura = Math.min(MAX_COLUNAS, dados.reduce((maior, l) => Math.max(maior, l.length), cabecalho?.length ?? 0))
  const colunas: Array<ColunaPlanilha & { fracaoNome: number }> = []
  for (let i = 0; i < largura; i++) {
    const valores = dados.map((l) => l[i] ?? '').filter(Boolean).slice(0, 1000)
    if (valores.length === 0) continue
    const fracao = (teste: (v: string) => boolean) => valores.filter(teste).length / valores.length
    const rotulo = cabecalho?.[i]?.trim() || `Coluna ${i + 1}`
    const dica = cabecalho ? dicaDoCabecalho(rotulo) : null
    const fracaoTelefone = fracao(pareceTelefone)
    const fracaoEmail = fracao(pareceEmail)
    const fracaoNome = fracao(pareceNome)
    const tipo: TipoColuna =
      dica === 'documento'
        ? 'texto'
        : fracaoTelefone >= 0.6
          ? 'telefone'
          : fracaoEmail >= 0.6
            ? 'email'
            : dica === 'nome' && fracaoTelefone < 0.3
              ? 'nome'
              : 'texto'
    colunas.push({ chave: `c${i}`, rotulo, tipo, fracaoNome })
  }
  // Sem cabeçalho "nome": a 1ª coluna de texto com cara de nome vira a coluna de nome.
  if (!colunas.some((c) => c.tipo === 'nome')) {
    const candidata = colunas.find((c) => c.tipo === 'texto' && c.fracaoNome >= 0.6)
    if (candidata) candidata.tipo = 'nome'
  }
  return colunas.map(({ chave, rotulo, tipo }) => ({ chave, rotulo, tipo }))
}

export function sugerirMapeamento(colunas: ColunaPlanilha[]): Mapeamento {
  const primeira = (tipo: TipoColuna) => colunas.find((c) => c.tipo === tipo)?.chave ?? null
  const celular = colunas.find((c) => c.tipo === 'telefone' && pareceCelular(c.rotulo))?.chave
  return { nome: primeira('nome'), whatsapp: celular ?? primeira('telefone'), email: primeira('email') }
}

const indiceDa = (chave: string) => Number(chave.slice(1))

/**
 * Linhas → leads prontos para gravar: guarda todas as colunas em `dados`,
 * normaliza o WhatsApp e descarta números repetidos (fica a 1ª ocorrência).
 */
export function prepararLeads(
  dados: string[][],
  colunas: ColunaPlanilha[],
  mapeamento: Mapeamento,
  { somenteComWhatsapp = false } = {},
): { leads: LeadImportacao[]; resumo: ResumoImportacao } {
  const resumo: ResumoImportacao = { linhas: 0, comWhatsapp: 0, semWhatsapp: 0, duplicados: 0, ignorados: 0 }
  const vistos = new Set<string>()
  const leads: LeadImportacao[] = []

  dados.forEach((linha, i) => {
    const valores: Record<string, string> = {}
    for (const c of colunas) {
      const v = limparCelula(linha[indiceDa(c.chave)] ?? '')
      if (v) valores[c.chave] = v
    }
    if (Object.keys(valores).length === 0) return
    resumo.linhas++

    const bruto = mapeamento.whatsapp ? (valores[mapeamento.whatsapp] ?? '') : ''
    const whatsapp = bruto && whatsappValido(bruto) ? normalizarWhatsapp(bruto) : null
    if (whatsapp && vistos.has(whatsapp)) {
      resumo.duplicados++
      return
    }
    if (!whatsapp && somenteComWhatsapp) {
      resumo.ignorados++
      return
    }
    if (whatsapp) {
      vistos.add(whatsapp)
      resumo.comWhatsapp++
    } else resumo.semWhatsapp++

    const email = mapeamento.email ? (valores[mapeamento.email] ?? '') : ''
    leads.push({
      linha: i + 1,
      nome: mapeamento.nome ? (valores[mapeamento.nome] ?? null) : null,
      whatsapp,
      email: pareceEmail(email) ? email.toLowerCase() : null,
      dados: valores,
    })
  })

  return { leads, resumo }
}

/** Nome sugerido para a lista a partir do arquivo: "grupo-vip_2026.xlsx" → "Grupo vip 2026". */
export function nomeDaListaPeloArquivo(arquivo: string): string {
  const base = arquivo.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Nova lista'
}
