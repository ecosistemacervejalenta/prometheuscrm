import { useMemo, useSyncExternalStore } from 'react'

/**
 * O que o link da pré-venda lembra NO APARELHO do cliente (localStorage):
 *   • os dados dele, para a próxima compra ser só conferir e confirmar;
 *   • o pedido recém-feito, para a tela do PIX continuar lá se o navegador
 *     recarregar a página enquanto ele vai ao app do banco.
 * Tudo é opcional: navegação anônima ou armazenamento bloqueado só desligam o atalho.
 */

export type DadosCliente = {
  nome: string
  sobrenome: string
  /** Pedido pelo Mercado Pago para gerar o PIX. Vazio em cadastros lembrados antes desta pergunta. */
  email: string
  whatsapp: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export type PedidoFeito = {
  /** Id do pedido (paga o PIX do Mercado Pago). Pedidos lembrados antes do PIX automático não têm. */
  pedidoId?: string
  numero: number
  total: number
  subtotal: number
  taxaEntrega: number
  frete: 'vip' | 'a_cotar'
  nome: string
  itens: Array<{ nome: string; quantidade: number; total: number }>
}

export const CLIENTE_VAZIO: DadosCliente = {
  nome: '',
  sobrenome: '',
  email: '',
  whatsapp: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
}

const CHAVE_CLIENTE = 'prometheus:cliente'
const chavePedido = (slug: string) => `prometheus:pedido:${slug}`

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    // armazenamento indisponível: segue sem lembrar
  }
}

function remover(chave: string) {
  try {
    window.localStorage.removeItem(chave)
  } catch {
    // idem
  }
}

function converter<T>(texto: string | null, valido: (v: Record<string, unknown>) => boolean): T | null {
  if (!texto) return null
  try {
    const valor = JSON.parse(texto)
    return valor && typeof valor === 'object' && valido(valor) ? (valor as T) : null
  } catch {
    return null
  }
}

// O e-mail entrou depois: cadastro lembrado sem ele continua valendo (o link pede só o e-mail).
const clienteValido = (v: Record<string, unknown>) =>
  (Object.keys(CLIENTE_VAZIO) as Array<keyof DadosCliente>).every((campo) => campo === 'email' || typeof v[campo] === 'string') &&
  Boolean(String(v.nome).trim() && String(v.whatsapp).trim())

/** E-mail com cara de e-mail (o Mercado Pago recusa os malformados). */
export const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())

const pedidoValido = (v: Record<string, unknown>) =>
  typeof v.numero === 'number' && typeof v.total === 'number' && Array.isArray(v.itens)

const semInscricao = () => () => {}

/** Lê o que está guardado no aparelho. No servidor (e na hidratação) devolve vazio. */
export function useArmazenado(slug: string) {
  const noNavegador = useSyncExternalStore(semInscricao, () => true, () => false)
  const textoCliente = useSyncExternalStore(semInscricao, () => ler(CHAVE_CLIENTE), () => null)
  const textoPedido = useSyncExternalStore(semInscricao, () => ler(chavePedido(slug)), () => null)
  const cliente = useMemo(() => {
    const salvo = converter<DadosCliente>(textoCliente, clienteValido)
    return salvo && { ...salvo, email: typeof salvo.email === 'string' ? salvo.email : '' }
  }, [textoCliente])
  const pedido = useMemo(() => converter<PedidoFeito>(textoPedido, pedidoValido), [textoPedido])
  return { noNavegador, cliente, pedido }
}

export const lembrarCliente = (dados: DadosCliente) => gravar(CHAVE_CLIENTE, dados)
export const esquecerCliente = () => remover(CHAVE_CLIENTE)
export const lembrarPedido = (slug: string, pedido: PedidoFeito) => gravar(chavePedido(slug), pedido)
export const esquecerPedido = (slug: string) => remover(chavePedido(slug))
