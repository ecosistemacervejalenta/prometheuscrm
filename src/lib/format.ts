import { diasDesde, FUSO } from './datas'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR')

/** R$ 1.234,56 */
export function formatarMoeda(valor: number | string | null | undefined): string {
  return moeda.format(Number(valor ?? 0))
}

/** R$ 482.910 (sem centavos, para destaques). */
export function formatarMoedaCompacta(valor: number | string | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(valor ?? 0))
}

/** 24.812 */
export function formatarNumero(valor: number | string | null | undefined): string {
  return numero.format(Number(valor ?? 0))
}

/** Valor numérico para inputs de dinheiro: 1234.5 → "1234,50". */
export function valorParaInput(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return ''
  return Number(valor).toFixed(2).replace('.', ',')
}

/**
 * Converte texto de dinheiro em número (NaN se inválido):
 * "1.234,56" | "1234,56" | "1234.56" | "R$ 10" | "1.200" (mil e duzentos) | "1,234.56".
 * Com vírgula e ponto, o último separador é o decimal. Só com ponto, grupos de
 * 3 dígitos ("1.200", "12.500.000") são milhares, como se escreve no Brasil.
 */
export function lerDinheiro(texto: string): number {
  const limpo = texto.replace(/[R$\s]/g, '')
  const virgula = limpo.lastIndexOf(',')
  const ponto = limpo.lastIndexOf('.')
  if (virgula >= 0 && ponto >= 0) {
    return virgula > ponto ? Number(limpo.replace(/\./g, '').replace(',', '.')) : Number(limpo.replace(/,/g, ''))
  }
  if (virgula >= 0) return Number(limpo.replace(',', '.'))
  if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ''))
  return Number(limpo)
}

function data(iso: string) {
  // Datas puras ("2026-10-05") são tratadas como meio-dia UTC para não "voltar um dia".
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
}

/** 01/10/2026 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO }).format(data(iso))
}

/** 01 out */
export function formatarDataCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: 'short' })
    .format(data(iso))
    .replace('.', '')
}

/** 01/10/2026 às 14:32 */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = data(iso)
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO }).format(d)
  return `${dia} às ${formatarHora(iso)}`
}

/** 14:32 */
export function formatarHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
  }).format(data(iso))
}

/** Quarta, 1 de outubro */
export function formatarDataPorExtenso(iso: string): string {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(data(iso))
  const semFeira = texto.replace('-feira', '')
  return semFeira.charAt(0).toUpperCase() + semFeira.slice(1)
}

/** "2026-10" → "Outubro de 2026" */
export function formatarMes(mes: string): string {
  const texto = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${mes}-15T12:00:00Z`),
  )
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** "mar/2024" */
export function formatarMesAno(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: FUSO })
    .format(data(iso))
    .replace('. de ', '/')
    .replace(' de ', '/')
    .replace('.', '')
}

/** agora · há 5 min · há 3 h · 02/10/2026 às 14:30 (para "atualizado …"). */
export function formatarHaQuanto(iso: string | null | undefined): string {
  if (!iso) return '—'
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  return formatarDataHora(iso)
}

/** hoje · ontem · 12 dias · 3 meses */
export function formatarRelativo(iso: string | null | undefined): string {
  const dias = diasDesde(iso)
  if (dias === null) return '—'
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias === -1) return 'amanhã'
  if (dias < 0) return `em ${Math.abs(dias)} dias`
  if (dias < 60) return `${dias} dias`
  const meses = Math.floor(dias / 30)
  if (meses < 24) return `${meses} meses`
  return `${Math.floor(meses / 12)} anos`
}

/** 5511987654321 → (11) 98765-4321 */
export function formatarWhatsapp(numero: string | null | undefined): string {
  if (!numero) return '—'
  const d = numero.replace(/\D/g, '')
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return `+${d}`
}

/** 05422000 → 05422-000 */
export function formatarCep(cep: string | null | undefined): string {
  if (!cep) return ''
  const d = cep.replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep
}

/** 12345678000190 → 12.345.678/0001-90 */
export function formatarCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return '—'
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** 12345678901 → 123.456.789-01 */
export function formatarCpf(cpf: string | null | undefined): string {
  if (!cpf) return '—'
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** 10482 → #PRM-10482 */
export function numeroPedido(numero: number | string | null | undefined): string {
  return `#PRM-${numero ?? '—'}`
}

/** "Mariana Costa" → "MC" */
export function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

/** Primeiro nome: "Mariana Costa" → "Mariana" */
export function primeiroNome(nome: string | null | undefined): string {
  return nome?.trim().split(/\s+/)[0] ?? ''
}

/** Endereço em uma linha a partir das colunas (cliente) ou do JSON do pedido. */
export type Endereco = {
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  referencia?: string | null
}

export function formatarEndereco(e: Endereco | null | undefined): string {
  if (!e?.logradouro) return ''
  const linha1 = [e.logradouro, e.numero ?? 's/n'].join(', ') + (e.complemento ? ` — ${e.complemento}` : '')
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/')
  return [linha1, e.bairro, cidade, e.cep ? `CEP ${formatarCep(e.cep)}` : null].filter(Boolean).join(' · ')
}

/** "1 garrafa" / "3 garrafas" */
export function plural(quantidade: number, singular: string, pluralTexto?: string): string {
  return `${formatarNumero(quantidade)} ${quantidade === 1 ? singular : (pluralTexto ?? `${singular}s`)}`
}
