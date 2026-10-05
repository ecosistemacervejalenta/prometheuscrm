/**
 * Leitura da lista de CEPs do frete VIP (planilha ou texto colado) — funções
 * puras, executadas no navegador (prévia instantânea) e testáveis no Node.
 *
 * Aceita, em qualquer coluna:
 *   • CEP avulso: 01310-100 · 01310100 · 01.310-100 · 1310100 (o Excel apaga o 0 inicial)
 *   • faixa numa célula: "01000-000 a 01999-999" · "01000000-01999999"
 *   • faixa em duas colunas: "CEP inicial" e "CEP final"
 */

/** [início, fim] — números de 8 dígitos (01000-000 → 1000000). CEP avulso: início = fim. */
export type Faixa = [number, number]

export type AnaliseCeps = {
  faixas: Faixa[]
  /** CEPs avulsos e faixas encontrados (antes de juntar repetidos e vizinhos). */
  avulsos: number
  intervalos: number
  /** Linhas com dados mas sem nenhum CEP reconhecido. */
  ignoradas: number
  /** Total de CEPs cobertos pela lista. */
  cobertos: number
  /** Há duas colunas de CEP que podem ser lidas como faixa (início e fim)? */
  temDuasColunas: boolean
  /** As duas colunas foram lidas como faixa? */
  comoFaixa: boolean
}

export const MAX_FAIXAS = 200_000

const MENOR_CEP = 1_000_000 // 01000-000: não existe CEP começando com 00
const MAIOR_CEP = 99_999_999
const CEP = String.raw`\d{2}\.?\d{3}-?\d{3}`
const SO_CEP = new RegExp(`^(?:${CEP}|\\d{7})$`)
const FAIXA_NA_CELULA = new RegExp(`(${CEP}|\\d{7})\\s*(?:a|à|ao|até|ate|-|–|—|/|>|\\|)\\s*(${CEP}|\\d{7})`, 'i')

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digitos = (texto: string) => texto.replace(/\D/g, '')
const valido = (n: number) => Number.isInteger(n) && n >= MENOR_CEP && n <= MAIOR_CEP

/** "01310-100" → 1310100 · texto que não é um CEP → null. */
export function lerCep(valor: string): number | null {
  const v = valor.trim().replace(/\s+/g, '')
  if (!SO_CEP.test(v)) return null
  const n = Number(digitos(v))
  return valido(n) ? n : null
}

/** 1310100 → "01310100" (formato gravado no banco). */
export const cepParaTexto = (n: number) => String(n).padStart(8, '0')

/** 1310100 → "01310-100" */
export function formatarCepNumero(n: number) {
  const t = cepParaTexto(n)
  return `${t.slice(0, 5)}-${t.slice(5)}`
}

/** Faixa escrita numa célula só ("01000-000 a 01999-999"). */
function lerFaixaNaCelula(valor: string): Faixa | null {
  const achado = valor.match(FAIXA_NA_CELULA)
  if (!achado) return null
  const inicio = lerCep(achado[1])
  const fim = lerCep(achado[2])
  if (inicio === null || fim === null) return null
  return inicio <= fim ? [inicio, fim] : [fim, inicio]
}

const temCep = (valor: string) => lerCep(valor) !== null || lerFaixaNaCelula(valor) !== null

/**
 * Texto colado: um CEP ou faixa por linha (vírgula e ponto e vírgula também separam CEPs).
 * Tab separa colunas — é o que vem ao copiar células do Excel.
 */
export function linhasDoTexto(texto: string): string[][] {
  return texto
    .split(/\r?\n/)
    .flatMap((linha) => (linha.includes('\t') ? [linha.split('\t')] : linha.split(/[;,|]/).map((v) => [v])))
    .map((linha) => linha.map((c) => c.trim()))
    .filter((linha) => linha.some(Boolean))
}

/** Junta faixas repetidas, sobrepostas ou vizinhas (01310-100 + 01310-101 → uma faixa). */
export function juntarFaixas(faixas: Faixa[]): Faixa[] {
  const ordenadas = [...faixas].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const resultado: Faixa[] = []
  for (const [inicio, fim] of ordenadas) {
    const ultima = resultado[resultado.length - 1]
    if (ultima && inicio <= ultima[1] + 1) ultima[1] = Math.max(ultima[1], fim)
    else resultado.push([inicio, fim])
  }
  return resultado
}

/**
 * Linhas da planilha → faixas de CEP prontas para gravar.
 * `duasColunasComoFaixa` força (true) ou impede (false) a leitura de duas colunas
 * de CEP como início/fim; sem o parâmetro, decide pelo cabeçalho e pelos valores.
 */
export function analisarCeps(linhas: string[][], duasColunasComoFaixa?: boolean): AnaliseCeps {
  const primeira = linhas[0] ?? []
  const temCabecalho = linhas.length > 1 && !primeira.some(temCep) && primeira.some((v) => /[a-zA-ZÀ-ÿ]/.test(v))
  const cabecalho = temCabecalho ? primeira.map(semAcento) : []
  const dados = temCabecalho ? linhas.slice(1) : linhas
  const largura = Math.max(0, ...dados.map((l) => l.length))

  // Colunas com CEP: a maioria dos valores é CEP/faixa, ou o cabeçalho diz "CEP".
  const colunasCep: number[] = []
  for (let i = 0; i < largura; i++) {
    const valores = dados.map((l) => l[i] ?? '').filter(Boolean).slice(0, 2000)
    if (valores.length === 0) continue
    const fracao = valores.filter(temCep).length / valores.length
    if (fracao >= 0.5 || (/cep/.test(cabecalho[i] ?? '') && fracao > 0)) colunasCep.push(i)
  }

  // Duas colunas de CEP = faixa (início/fim) quando o cabeçalho indica ou quando
  // quase todas as linhas têm os dois CEPs, a 1ª menor ou igual à 2ª, com intervalos de verdade.
  let colunaInicio: number | null = null
  let colunaFim: number | null = null
  const ehInicio = (r: string) => /(inicial|inicio|^de\b|\bde$|minimo|^min|comeco|primeiro)/.test(r)
  const ehFim = (r: string) => /(final|\bfim\b|ate\b|maximo|^max|termino|ultimo)/.test(r)
  const indiceInicio = colunasCep.find((i) => ehInicio(cabecalho[i] ?? ''))
  const indiceFim = colunasCep.find((i) => ehFim(cabecalho[i] ?? ''))
  const candidatas: [number, number] | null =
    indiceInicio !== undefined && indiceFim !== undefined && indiceInicio !== indiceFim
      ? [indiceInicio, indiceFim]
      : colunasCep.length === 2
        ? [colunasCep[0], colunasCep[1]]
        : null

  if (candidatas) {
    let comoFaixa = duasColunasComoFaixa
    if (comoFaixa === undefined) {
      if (candidatas[0] === indiceInicio && candidatas[1] === indiceFim) comoFaixa = true
      else {
        const [a, b] = candidatas
        const comDados = dados.filter((l) => l.some(Boolean)).length
        const pares = dados
          .map((l) => [lerCep(l[a] ?? ''), lerCep(l[b] ?? '')] as const)
          .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null)
        const crescentes = pares.filter(([x, y]) => x <= y).length
        const intervalosReais = pares.filter(([x, y]) => x < y).length
        comoFaixa =
          pares.length >= 2 &&
          pares.length >= comDados * 0.8 &&
          crescentes >= pares.length * 0.9 &&
          intervalosReais >= pares.length * 0.5
      }
    }
    if (comoFaixa) [colunaInicio, colunaFim] = candidatas
  }

  const faixas: Faixa[] = []
  let avulsos = 0
  let intervalos = 0
  let ignoradas = 0

  for (const linha of dados) {
    if (!linha.some(Boolean)) continue
    const antes = faixas.length

    if (colunaInicio !== null && colunaFim !== null) {
      const inicio = lerCep(linha[colunaInicio] ?? '')
      const fim = lerCep(linha[colunaFim] ?? '')
      if (inicio !== null && fim !== null) {
        faixas.push(inicio <= fim ? [inicio, fim] : [fim, inicio])
        if (inicio === fim) avulsos++
        else intervalos++
      } else if (inicio !== null || fim !== null) {
        const unico = (inicio ?? fim) as number
        faixas.push([unico, unico])
        avulsos++
      }
    }

    for (const i of colunasCep) {
      if (i === colunaInicio || i === colunaFim) continue
      const valor = linha[i] ?? ''
      const faixa = lerFaixaNaCelula(valor)
      if (faixa) {
        faixas.push(faixa)
        intervalos++
        continue
      }
      const cep = lerCep(valor)
      if (cep !== null) {
        faixas.push([cep, cep])
        avulsos++
      }
    }

    if (faixas.length === antes) ignoradas++
  }

  const juntas = juntarFaixas(faixas)
  return {
    faixas: juntas,
    avulsos,
    intervalos,
    ignoradas,
    cobertos: juntas.reduce((s, [inicio, fim]) => s + fim - inicio + 1, 0),
    temDuasColunas: candidatas !== null,
    comoFaixa: colunaInicio !== null,
  }
}
