'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { traduzirErro } from '@/lib/acoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarWhatsapp, whatsappValido } from '@/lib/whatsapp'

import { agendarProcessamentoDeEventos } from '../../integracoes/eventos'
import { agendarFilaEstoqueOlist } from '../../olist/estoque'
import { lerCaixa, type CaixaPublica } from './caixa-dados'
import { aparelhoConfirmou, conferirCodigo, enviarCodigo, esquecerAparelho, mesmoNumero, whatsappConfirmado } from './verificacao'

/**
 * Ações do link PÚBLICO de pré-venda (sem login).
 * Rodam no servidor com a chave secreta e chamam funções do banco que
 * validam tudo (pré-venda ativa, preços, limites, estoque, frete e a Caixa VIP).
 * Cadastro, caixa e compra exigem o WhatsApp confirmado por código neste aparelho (./verificacao).
 */

/** O CEP tem frete fixo (lista de CEPs VIP)? Só responde para pré-vendas ativas. */
export async function consultarFreteLink(
  slug: string,
  cep: string,
): Promise<{ ok: true; vip: boolean } | { ok: false; mensagem: string }> {
  const digitos = cep.replace(/\D/g, '')
  if (digitos.length !== 8) return { ok: false, mensagem: 'CEP inválido.' }

  const db = createAdminClient()
  const { data: preVenda } = await db.from('vw_pre_vendas').select('status_efetivo').eq('slug', slug).maybeSingle()
  if (preVenda?.status_efetivo !== 'ativa') return { ok: false, mensagem: 'Esta pré-venda não está mais disponível.' }

  const { data, error } = await db.rpc('cep_tem_frete_vip', { p_cep: digitos })
  if (error) return { ok: false, mensagem: 'Não foi possível consultar o frete.' }
  return { ok: true, vip: Boolean(data) }
}

const emailDoLink = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.email('Confira o seu e-mail.').max(120))

const esquemaConfirmacao = z.object({
  slug: z.string().min(1),
  whatsapp: z.string().refine(whatsappValido, 'Informe um WhatsApp válido.'),
  itens: z
    .array(z.object({ produto_id: z.uuid(), quantidade: z.number().int().positive().max(999) }))
    .min(1, 'Escolha pelo menos um item.'),
  observacoes: z.string().max(500).optional(),
  armadilha: z.string().max(0, 'Envio inválido.').optional(), // campo invisível anti-robô
  /** Obrigatório para cliente novo; quem já tem caixa pode não informar (vale o e-mail do cadastro). */
  email: emailDoLink.optional(),
  /**
   * Nome e endereço digitados agora. Sem eles, vale o cadastro do WhatsApp — é o caso de quem
   * já tem uma Caixa VIP aberta e compra de outro aparelho (o endereço da caixa não é exibido).
   */
  cliente: z
    .object({
      nome: z.string().trim().min(2, 'Informe seu nome e sobrenome.').max(120),
      cep: z.string().refine((v) => v.replace(/\D/g, '').length === 8, 'Informe o CEP.'),
      logradouro: z.string().trim().min(1, 'Informe a rua.').max(160),
      numero: z.string().trim().min(1, 'Informe o número.').max(20),
      complemento: z.string().trim().max(80).optional(),
      bairro: z.string().trim().min(1, 'Informe o bairro.').max(80),
      cidade: z.string().trim().min(1, 'Informe a cidade.').max(80),
      uf: z.string().trim().length(2, 'Informe a UF.'),
    })
    .optional(),
})

export type ResultadoConfirmacao =
  | { ok: true; pedidoId: string; numero: number; total: number; subtotal: number; taxaEntrega: number; frete: 'vip' | 'a_cotar'; caixa: CaixaPublica | null }
  | { ok: false; mensagem: string; precisaCodigo?: boolean }

export async function confirmarPedidoPreVenda(entrada: z.input<typeof esquemaConfirmacao>): Promise<ResultadoConfirmacao> {
  const dados = esquemaConfirmacao.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? 'Dados inválidos.' }

  const { slug, whatsapp, itens, observacoes, cliente, email } = dados.data
  if (cliente && !email) return { ok: false, mensagem: 'Informe o seu e-mail.' }

  // Só compra quem confirmou o WhatsApp neste aparelho: ninguém mexe na caixa nem no endereço de outra pessoa.
  if (!(await aparelhoConfirmou(whatsapp))) {
    return { ok: false, precisaCodigo: true, mensagem: 'Confirme o seu WhatsApp com o código para continuar.' }
  }

  const db = createAdminClient()
  const numeroWhatsapp = normalizarWhatsapp(whatsapp) ?? ''
  // Cadastro de antes desta compra: o link veio preenchido com ele, então só grava o que mudou.
  const antes = cliente ? await lerCadastro(db, numeroWhatsapp) : null
  const atualizarEndereco = cliente ? await enderecoMudou(db, antes, cliente) : false

  const { data, error } = await db.rpc('registrar_pedido_pre_venda', {
    p_slug: slug,
    p_cliente: { ...cliente, ...(cliente ? { uf: cliente.uf.toUpperCase() } : {}), email, whatsapp: numeroWhatsapp },
    p_itens: itens,
    p_atualizar_endereco: atualizarEndereco,
    p_observacoes: observacoes?.trim() || undefined,
  })
  if (error) return { ok: false, mensagem: traduzirErro(error) }

  // E-mail no cadastro: o Mercado Pago usa no PIX (preparar_cobranca_pix lê clientes.email).
  // Nome corrigido no link também vale para o CRM (o banco só grava o nome no primeiro cadastro).
  const nomeNovo = cliente && antes && semEspacosSobrando(cliente.nome) !== semEspacosSobrando(antes.nome) ? semEspacosSobrando(cliente.nome) : null
  if (email || nomeNovo) {
    const { error: erroCadastro } = await db
      .from('clientes')
      .update({ ...(email ? { email } : {}), ...(nomeNovo ? { nome: nomeNovo } : {}) })
      .eq('id', data.cliente_id)
    if (erroCadastro) console.error('[pre-venda] cadastro do cliente', erroCadastro.message)
    else if (nomeNovo && antes) {
      await db.from('atividades').insert({
        cliente_id: data.cliente_id,
        tipo: 'nome_atualizado',
        descricao: `Nome atualizado pelo link da pré-venda: "${antes.nome}" → "${nomeNovo}"`,
      })
    }
  }

  const { data: caixa } = await db.rpc('caixa_publica', { p_pedido_id: data.id })

  agendarProcessamentoDeEventos()
  agendarFilaEstoqueOlist() // a compra já baixou na cópia local; aqui vai para a Olist
  revalidatePath(`/p/${slug}`)
  return {
    ok: true,
    pedidoId: data.id,
    numero: data.numero,
    total: Number(data.total),
    subtotal: Number(data.subtotal),
    taxaEntrega: Number(data.taxa_entrega),
    frete: data.frete === 'vip' ? 'vip' : 'a_cotar',
    caixa: lerCaixa(caixa),
  }
}

// -----------------------------------------------------------------------------
// Caixa VIP
// -----------------------------------------------------------------------------

export type ResultadoIdentificacao =
  | { ok: true; precisaCodigo: false; cadastro: CadastroDoCliente | null; caixa: CaixaPublica | null }
  /** Mandamos um código no WhatsApp: o link pede o código antes de mostrar qualquer dado. */
  | { ok: true; precisaCodigo: true; enviado: boolean; espera: number; aviso?: string }
  | { ok: false; mensagem: string }

async function preVendaAtiva(slug: string) {
  const { data } = await createAdminClient().from('vw_pre_vendas').select('status_efetivo').eq('slug', slug).maybeSingle()
  return data?.status_efetivo === 'ativa'
}

/**
 * O cliente digitou o WhatsApp. Aparelho já confirmado para esse número → devolve o cadastro do
 * CRM (o link vem preenchido) e a Caixa VIP em andamento. Senão → manda um código no WhatsApp
 * e não diz nada sobre o número (nem se ele já é cliente).
 * Decisão do dono da loja (2026-11-25, LGPD): nada do cadastro aparece sem o código.
 */
export async function identificarCliente(slug: string, whatsapp: string): Promise<ResultadoIdentificacao> {
  if (!whatsappValido(whatsapp)) return { ok: false, mensagem: 'Confira o número: DDD + celular.' }
  if (!(await preVendaAtiva(slug))) return { ok: false, mensagem: 'Esta pré-venda não está mais disponível.' }

  if (!(await aparelhoConfirmou(whatsapp))) {
    const r = await enviarCodigo(whatsapp)
    return r.ok ? { ok: true, precisaCodigo: true, enviado: r.enviado, espera: r.espera, aviso: r.aviso } : r
  }
  return { ok: true, precisaCodigo: false, ...(await dadosDoWhatsapp(normalizarWhatsapp(whatsapp) ?? '')) }
}

/** "Reenviar código". */
export async function reenviarCodigo(slug: string, whatsapp: string): Promise<ResultadoIdentificacao> {
  if (!whatsappValido(whatsapp)) return { ok: false, mensagem: 'Confira o número: DDD + celular.' }
  if (!(await preVendaAtiva(slug))) return { ok: false, mensagem: 'Esta pré-venda não está mais disponível.' }
  const r = await enviarCodigo(whatsapp)
  return r.ok ? { ok: true, precisaCodigo: true, enviado: r.enviado, espera: r.espera, aviso: r.aviso } : r
}

export type ResultadoCodigo =
  | { ok: true; cadastro: CadastroDoCliente | null; caixa: CaixaPublica | null }
  | { ok: false; mensagem: string; pedirOutro?: boolean }

/** O cliente digitou o código: confirma o aparelho e devolve o cadastro e a caixa. */
export async function confirmarCodigoWhatsapp(slug: string, whatsapp: string, codigo: string): Promise<ResultadoCodigo> {
  if (!whatsappValido(whatsapp)) return { ok: false, mensagem: 'Confira o número: DDD + celular.' }
  if (!(await preVendaAtiva(slug))) return { ok: false, mensagem: 'Esta pré-venda não está mais disponível.' }
  const r = await conferirCodigo(whatsapp, codigo)
  if (!r.ok) return r
  return { ok: true, ...(await dadosDoWhatsapp(normalizarWhatsapp(whatsapp) ?? '')) }
}

/** "Não sou eu" / trocar de número: este aparelho deixa de ver os dados do número confirmado. */
export async function sairDoAparelho(): Promise<void> {
  await esquecerAparelho()
}

/** Cadastro do CRM + Caixa VIP em andamento de um WhatsApp JÁ confirmado neste aparelho. */
async function dadosDoWhatsapp(numero: string): Promise<{ cadastro: CadastroDoCliente | null; caixa: CaixaPublica | null }> {
  const db = createAdminClient()
  const [cadastro, { data, error }] = await Promise.all([lerCadastro(db, numero), db.rpc('caixa_do_whatsapp', { p_whatsapp: numero })])
  if (error) console.error('[pre-venda] identificar caixa', error.message)
  const r = (data ?? {}) as { caixa?: unknown }
  return {
    cadastro: cadastro && {
      nome: cadastro.nome,
      email: cadastro.email ?? '',
      cep: cadastro.cep ?? '',
      logradouro: cadastro.logradouro ?? '',
      numero: cadastro.numero ?? '',
      complemento: cadastro.complemento ?? '',
      bairro: cadastro.bairro ?? '',
      cidade: cadastro.cidade ?? '',
      uf: cadastro.uf ?? '',
    },
    caixa: error ? null : lerCaixa(r.caixa),
  }
}

// -----------------------------------------------------------------------------
// Cadastro do cliente (fica no CRM para sempre: excluir a pré-venda não apaga o cliente)
// -----------------------------------------------------------------------------

/** O que o link mostra preenchido para quem já comprou. O nome vem inteiro (o link separa o sobrenome). */
export type CadastroDoCliente = {
  nome: string
  email: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

type Db = ReturnType<typeof createAdminClient>
type CamposEndereco = { cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null }

const COLUNAS_CADASTRO = 'id, nome, email, cep, logradouro, numero, complemento, bairro, cidade, uf'

async function lerCadastro(db: Db, whatsapp: string) {
  if (!whatsapp) return null
  const { data, error } = await db.from('clientes').select(COLUNAS_CADASTRO).eq('whatsapp', whatsapp).maybeSingle()
  if (error) console.error('[pre-venda] cadastro do WhatsApp', error.message)
  return data
}

const semEspacosSobrando = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ')
const comparavel = (v: string | null | undefined) => semEspacosSobrando(v).toLocaleLowerCase('pt-BR')

function mesmoEndereco(a: CamposEndereco, b: CamposEndereco) {
  return (
    (a.cep ?? '').replace(/\D/g, '') === (b.cep ?? '').replace(/\D/g, '') &&
    (['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const).every((campo) => comparavel(a[campo]) === comparavel(b[campo]))
  )
}

/**
 * O endereço confirmado no link é diferente do que já está gravado? Compara com o cadastro e com a
 * Caixa VIP em andamento (a equipe pode ter mudado o cadastro depois que a caixa abriu).
 * Mesma regra de caixa em andamento de public.caixa_em_andamento().
 */
async function enderecoMudou(db: Db, antes: Awaited<ReturnType<typeof lerCadastro>>, digitado: CamposEndereco) {
  if (!antes?.logradouro || !mesmoEndereco(antes, digitado)) return true
  const { data: caixa } = await db
    .from('pedidos')
    .select('endereco_entrega')
    .eq('cliente_id', antes.id)
    .not('caixa', 'is', null)
    .in('status', ['novo', 'confirmado'])
    .neq('status_pagamento', 'estornado')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  const enderecoDaCaixa = caixa?.endereco_entrega
  if (!caixa || !enderecoDaCaixa || typeof enderecoDaCaixa !== 'object' || Array.isArray(enderecoDaCaixa)) return Boolean(caixa)
  return !mesmoEndereco(enderecoDaCaixa as CamposEndereco, digitado)
}

const idPedido = z.uuid()

/** Caixa atual (tela final do link e /pagar). O pedido é identificado pelo UUID, que só o cliente tem. */
export async function minhaCaixa(pedidoId: string): Promise<CaixaPublica | null> {
  const id = idPedido.safeParse(pedidoId)
  if (!id.success) return null
  const { data } = await createAdminClient().rpc('caixa_publica', { p_pedido_id: id.data })
  return lerCaixa(data)
}

/** O cliente escolheu "fechar a caixa e pagar agora" (só do aparelho que confirmou o WhatsApp do dono da caixa). */
export async function fecharMinhaCaixa(pedidoId: string): Promise<CaixaPublica | null> {
  const id = idPedido.safeParse(pedidoId)
  if (!id.success) return null
  const db = createAdminClient()
  const [confirmado, { data: dono }] = await Promise.all([whatsappConfirmado(), db.rpc('whatsapp_do_pedido', { p_pedido_id: id.data })])
  if (!mesmoNumero(confirmado, dono)) {
    const { data } = await db.rpc('caixa_publica', { p_pedido_id: id.data })
    return lerCaixa(data)
  }
  const { error } = await db.rpc('fechar_caixa', { p_pedido_id: id.data })
  if (error) console.error('[pre-venda] fechar caixa', error.message)
  const { data } = await db.rpc('caixa_publica', { p_pedido_id: id.data })
  return lerCaixa(data)
}
