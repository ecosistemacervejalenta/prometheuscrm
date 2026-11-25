'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { ErroShopify } from '@/features/shopify/api'
import { errosDeValidacao, falha, sucesso, traduzirErro, type Credenciais, type EstadoAcao } from '@/lib/acoes'
import { exigirAdmin, exigirEquipe } from '@/lib/auth'
import { hojeISO } from '@/lib/datas'
import { formatarMoeda } from '@/lib/format'
import { gerarSenhaTemporaria } from '@/lib/senha'
import { acessoShopify } from '@/features/shopify/frete'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlDoSite } from '@/lib/url'
import { formParaObjeto } from '@/lib/validacao'
import type { StatusInfluenciador } from '@/types'

import { sincronizarCupomNaShopify } from './cupom'
import { formatarPercentual, STATUS_INFLUENCIADOR } from './rotulos'
import { esquemaEditarInfluenciador, esquemaNovoInfluenciador, esquemaPagamento, esquemaRegras } from './schema'
import { acessoComEscopo, ESCOPO_CUPONS, ESCOPO_PEDIDOS, lerLoja } from './shopify'
import { buscarVendasDoCupom, sincronizarVendas, type ResultadoDaSincronizacao } from './sincronizacao'

/**
 * Ações da equipe no programa de influenciadores.
 * O que fala com a Shopify ou cria login usa a chave secreta — sempre DEPOIS de exigirEquipe().
 */

const idValido = (id: string) => z.uuid().safeParse(id).success

function atualizarTelas(id?: string) {
  revalidatePath('/influenciadores', 'layout')
  if (id) revalidatePath(`/influenciadores/${id}`)
}

// -----------------------------------------------------------------------------
// Cadastro
// -----------------------------------------------------------------------------

export async function criarInfluenciador(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const dados = esquemaNovoInfluenciador.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const influenciador = dados.data

  const { data, error } = await supabase.from('influenciadores').insert(influenciador).select('id').single()
  if (error) return falha(traduzirErro(error))

  // Cupom na Shopify (cria ou liga o que já existe). Se não der, o cadastro fica e a tela explica o que falta.
  const admin = createAdminClient()
  await sincronizarCupomNaShopify(admin, data.id)
  // Cupom que já rodava antes do cadastro: traz as vendas desde a data escolhida.
  if (influenciador.contar_desde < hojeISO()) await buscarVendasDoCupom(admin, influenciador.cupom, influenciador.contar_desde)

  atualizarTelas()
  redirect(`/influenciadores/${data.id}?criado=1`)
}

export async function salvarInfluenciador(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(id)) return falha('Influenciador inválido.')
  const dados = esquemaEditarInfluenciador.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  const { data: antes } = await supabase.from('influenciadores').select('email, usuario_id, desconto_percentual, contar_desde, cupom').eq('id', id).maybeSingle()
  if (!antes) return falha('Influenciador não encontrado.')

  const admin = createAdminClient()
  // O e-mail é o login do Portal: troca primeiro lá (pode já estar em uso por outra conta).
  if (antes.usuario_id && antes.email !== dados.data.email) {
    const { error: erroLogin } = await admin.auth.admin.updateUserById(antes.usuario_id, { email: dados.data.email, email_confirm: true })
    if (erroLogin) {
      return {
        ok: false,
        mensagem: 'Revise os campos destacados.',
        erros: { email: [erroLogin.code === 'email_exists' ? 'Este e-mail já é usado por outro login.' : `Não foi possível trocar o e-mail do login: ${erroLogin.message}`] },
      }
    }
  }

  const { error } = await supabase.from('influenciadores').update(dados.data).eq('id', id)
  if (error) return falha(traduzirErro(error))

  if (Number(antes.desconto_percentual) !== dados.data.desconto_percentual) await sincronizarCupomNaShopify(admin, id)
  if (dados.data.contar_desde < antes.contar_desde) await buscarVendasDoCupom(admin, antes.cupom, dados.data.contar_desde)

  atualizarTelas(id)
  redirect(`/influenciadores/${id}`)
}

/** Pausar, reativar ou encerrar: o cupom na Shopify acompanha. */
export async function mudarStatusInfluenciador(id: string, status: StatusInfluenciador): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(id) || !(status in STATUS_INFLUENCIADOR)) return falha('Pedido inválido.')

  const { error } = await supabase.from('influenciadores').update({ status }).eq('id', id)
  if (error) return falha(traduzirErro(error))

  const cupom = await sincronizarCupomNaShopify(createAdminClient(), id)
  atualizarTelas(id)
  const feito = status === 'ativo' ? 'Influenciador reativado.' : status === 'pausado' ? 'Influenciador pausado.' : 'Parceria encerrada.'
  if (!cupom.ok) return falha(`${feito} Mas o cupom não foi atualizado na Shopify: ${cupom.mensagem}`)
  return sucesso(`${feito} ${cupom.mensagem}`)
}

export async function conferirCupom(id: string): Promise<EstadoAcao> {
  await exigirEquipe()
  if (!idValido(id)) return falha('Influenciador inválido.')
  const cupom = await sincronizarCupomNaShopify(createAdminClient(), id)
  atualizarTelas(id)
  return cupom.ok ? sucesso(cupom.mensagem) : falha(cupom.mensagem)
}

export async function excluirInfluenciador(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  if (!idValido(id)) return falha('Influenciador inválido.')

  const { data: i } = await supabase.from('influenciadores').select('usuario_id, status').eq('id', id).maybeSingle()
  if (!i) return falha('Influenciador não encontrado.')

  const admin = createAdminClient()
  // Desliga o cupom antes de apagar o cadastro (ele continua existindo na Shopify, desligado).
  if (i.status === 'ativo') {
    await supabase.from('influenciadores').update({ status: 'encerrado' }).eq('id', id)
    await sincronizarCupomNaShopify(admin, id)
  }

  const { error } = await supabase.from('influenciadores').delete().eq('id', id)
  if (error) {
    atualizarTelas(id)
    return falha(traduzirErro(error))
  }
  if (i.usuario_id) await admin.auth.admin.deleteUser(i.usuario_id)

  atualizarTelas()
  redirect('/influenciadores/lista')
}

// -----------------------------------------------------------------------------
// Login do Portal
// -----------------------------------------------------------------------------

async function credenciais(i: { nome: string; email: string; cupom: string; desconto_percentual: number }, senha: string): Promise<Credenciais> {
  const primeiroNome = i.nome.trim().split(/\s+/)[0]
  const mensagem = [
    `Olá, ${primeiroNome}! Seu acesso ao Portal de parceiros:`,
    `${await urlDoSite()}/portal`,
    `E-mail: ${i.email}`,
    `Senha temporária: ${senha}`,
    'No primeiro acesso você cria a sua senha pessoal.',
    '',
    `Seu cupom: ${i.cupom} (${formatarPercentual(i.desconto_percentual)} de desconto para quem usar). No Portal você acompanha as vendas e as comissões.`,
  ].join('\n')
  return { nome: i.nome, email: i.email, senha, mensagem }
}

/**
 * Cria o login do Portal com senha temporária (sem e-mail, como na Equipe): a equipe repassa
 * a mensagem e, no primeiro acesso, o influenciador cria a própria senha.
 */
export async function criarAcessoInfluenciador(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(id)) return falha('Influenciador inválido.')
  const { data: i } = await supabase.from('influenciadores').select('nome, email, cupom, desconto_percentual, usuario_id').eq('id', id).maybeSingle()
  if (!i) return falha('Influenciador não encontrado.')
  if (i.usuario_id) return falha('Este influenciador já tem acesso. Para uma senha nova, use “Nova senha”.')

  const senha = gerarSenhaTemporaria()
  const admin = createAdminClient()
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: i.email,
    password: senha,
    email_confirm: true,
    // `tipo` avisa o banco: este usuário não é da equipe (não ganha perfil).
    user_metadata: { nome: i.nome, tipo: 'influenciador' },
  })
  if (error) {
    return falha(
      error.code === 'email_exists'
        ? 'Este e-mail já tem um login no CRM (alguém da equipe?). Troque o e-mail do influenciador para criar o acesso.'
        : `Não foi possível criar o acesso: ${error.message}`,
    )
  }

  const { error: erroVinculo } = await admin.rpc('vincular_acesso_influenciador', { p_influenciador_id: id, p_usuario_id: criado.user.id })
  if (erroVinculo) {
    await admin.auth.admin.deleteUser(criado.user.id)
    return falha(traduzirErro(erroVinculo))
  }

  atualizarTelas(id)
  return { ok: true, mensagem: `Acesso de ${i.nome} criado.`, credenciais: await credenciais({ ...i, desconto_percentual: Number(i.desconto_percentual) }, senha) }
}

/** Outra senha temporária (esqueceu a senha). A atual deixa de valer. */
export async function novaSenhaInfluenciador(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(id)) return falha('Influenciador inválido.')
  const { data: i } = await supabase.from('influenciadores').select('nome, email, cupom, desconto_percentual, usuario_id').eq('id', id).maybeSingle()
  if (!i?.usuario_id) return falha('Este influenciador ainda não tem acesso ao Portal.')

  const senha = gerarSenhaTemporaria()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(i.usuario_id, { password: senha, email_confirm: true })
  if (error) return falha(`Não foi possível gerar a senha: ${error.message}`)

  const { error: erroFlag } = await admin.from('influenciadores').update({ trocar_senha: true }).eq('id', id)
  if (erroFlag) return falha(traduzirErro(erroFlag))

  atualizarTelas(id)
  return { ok: true, mensagem: 'Nova senha temporária gerada.', credenciais: await credenciais({ ...i, desconto_percentual: Number(i.desconto_percentual) }, senha) }
}

/** Tira o login do Portal (o cadastro, as vendas e os repasses continuam). */
export async function removerAcessoInfluenciador(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(id)) return falha('Influenciador inválido.')
  const { data: i } = await supabase.from('influenciadores').select('usuario_id').eq('id', id).maybeSingle()
  if (!i?.usuario_id) return falha('Este influenciador não tem acesso ao Portal.')

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(i.usuario_id)
  if (error) return falha(`Não foi possível remover o acesso: ${error.message}`)
  await admin.from('influenciadores').update({ usuario_id: null, trocar_senha: false, acesso_criado_em: null, ultimo_acesso_em: null }).eq('id', id)

  atualizarTelas(id)
  return sucesso('Acesso ao Portal removido.')
}

// -----------------------------------------------------------------------------
// Comissões e repasses
// -----------------------------------------------------------------------------

export async function registrarPagamento(id: string, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(id)) return falha('Influenciador inválido.')
  const dados = esquemaPagamento.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const ajuste = dados.data.ajuste_sentido === 'somar' ? dados.data.ajuste_valor : -dados.data.ajuste_valor

  const { data: pagamentoId, error } = await supabase.rpc('registrar_pagamento_influenciador', {
    p_influenciador_id: id,
    p_pago_em: dados.data.pago_em,
    p_ajuste: ajuste,
    p_ajuste_motivo: dados.data.ajuste_motivo ?? undefined,
    p_observacoes: dados.data.observacoes ?? undefined,
  })
  if (error) return falha(traduzirErro(error))

  const { data: pago } = await supabase.from('influenciador_pagamentos').select('total, vendas').eq('id', pagamentoId).maybeSingle()
  atualizarTelas(id)
  return sucesso(`Repasse de ${formatarMoeda(pago?.total)} registrado (${pago?.vendas ?? 0} venda(s) quitada(s)).`)
}

export async function desfazerPagamento(pagamentoId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  if (!idValido(pagamentoId)) return falha('Repasse inválido.')
  const { error } = await supabase.rpc('desfazer_pagamento_influenciador', { p_pagamento_id: pagamentoId })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Repasse desfeito: as comissões voltaram a ficar disponíveis.')
}

/** Cancela a comissão de uma venda (ex.: compra do próprio influenciador). */
export async function cancelarComissao(vendaId: string, motivo: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(vendaId)) return falha('Venda inválida.')
  if (!motivo.trim()) return falha('Informe o motivo.')
  const { error } = await supabase.rpc('bloquear_comissao_influenciador', { p_venda_id: vendaId, p_bloquear: true, p_motivo: motivo })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Comissão cancelada.')
}

export async function restaurarComissao(vendaId: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(vendaId)) return falha('Venda inválida.')
  const { error } = await supabase.rpc('bloquear_comissao_influenciador', { p_venda_id: vendaId, p_bloquear: false })
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Comissão restaurada.')
}

// -----------------------------------------------------------------------------
// Shopify: pedidos e permissões
// -----------------------------------------------------------------------------

function fraseDaSincronizacao(r: ResultadoDaSincronizacao): EstadoAcao {
  if (!r.ok) return falha(r.mensagem)
  const partes = [
    r.novas > 0 ? `${r.novas} venda(s) nova(s)` : null,
    r.atualizadas > 0 ? `${r.atualizadas} conferida(s)` : null,
  ].filter(Boolean)
  const achado = partes.length > 0 ? partes.join(' e ') : 'nenhuma venda nova com cupom'
  return sucesso(`Shopify lida: ${achado} em ${r.lidos} pedido(s).${r.incompleta ? ' Há mais pedidos: clique de novo para continuar.' : ''}`)
}

export async function sincronizarAgora(): Promise<EstadoAcao> {
  await exigirEquipe()
  const resultado = await sincronizarVendas(createAdminClient(), { conferirPermissao: true })
  atualizarTelas()
  return fraseDaSincronizacao(resultado)
}

/** Relê na Shopify os pedidos do cupom desde "contar vendas a partir de". */
export async function buscarVendasAntigas(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  if (!idValido(id)) return falha('Influenciador inválido.')
  const { data: i } = await supabase.from('influenciadores').select('cupom, contar_desde').eq('id', id).maybeSingle()
  if (!i) return falha('Influenciador não encontrado.')
  const resultado = await buscarVendasDoCupom(createAdminClient(), i.cupom, i.contar_desde)
  atualizarTelas(id)
  return fraseDaSincronizacao(resultado)
}

/** Depois de dar as permissões ao app na Shopify: pede um token novo e confere o que ele já pode fazer. */
export async function conferirPermissoes(): Promise<EstadoAcao> {
  await exigirEquipe()
  const admin = createAdminClient()
  try {
    const [cupons, pedidos] = [await acessoComEscopo(admin, ESCOPO_CUPONS, { conferir: true }), await acessoComEscopo(admin, ESCOPO_PEDIDOS)]
    revalidatePath('/influenciadores', 'layout')
    revalidatePath('/configuracoes', 'layout')
    if (!cupons.ok && cupons.motivo === 'sem_conexao') return falha(cupons.mensagem)
    if (cupons.ok && pedidos.ok) return sucesso('Tudo certo: o app já cria cupons e lê os pedidos.')
    const faltam = [cupons.ok ? null : ESCOPO_CUPONS, pedidos.ok ? null : ESCOPO_PEDIDOS].filter(Boolean).join(' e ')
    return falha(`Ainda falta a permissão ${faltam}. Crie uma versão do app com ela, clique em Release e aprove o novo acesso na loja.`)
  } catch (e) {
    if (!(e instanceof ErroShopify)) console.error('[influenciadores] conferir permissões', e)
    return falha(e instanceof ErroShopify ? e.message : 'Não foi possível falar com a Shopify. Tente de novo em instantes.')
  }
}

// -----------------------------------------------------------------------------
// Regras do programa
// -----------------------------------------------------------------------------

export async function salvarRegras(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const dados = esquemaRegras.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)
  const { error } = await supabase.from('configuracoes').update(dados.data).eq('id', 1)
  if (error) return falha(traduzirErro(error))
  atualizarTelas()
  return sucesso('Regras salvas. Comissão e carência novas valem para os próximos pedidos.')
}

/** Preenche o endereço público (e o nome, se vazio) da loja com o que está cadastrado na Shopify. */
export async function buscarEnderecoDaLoja(): Promise<EstadoAcao> {
  const { supabase } = await exigirAdmin()
  const admin = createAdminClient()
  try {
    const acesso = await acessoShopify(admin)
    if (!acesso) return falha('A Shopify não está conectada. Conecte em Configurações › Shopify.')
    const loja = await lerLoja(acesso)
    const url = loja.url.replace(/^http:\/\//i, 'https://')
    // O nome só é preenchido se estiver vazio: quem já escolheu um nome não o perde.
    const { data: atual } = await supabase.from('configuracoes').select('influ_nome_loja').eq('id', 1).maybeSingle()
    const { error } = await supabase
      .from('configuracoes')
      .update({ influ_loja_url: url, ...(atual?.influ_nome_loja ? {} : { influ_nome_loja: loja.nome.slice(0, 80) }) })
      .eq('id', 1)
    if (error) return falha(traduzirErro(error))
    atualizarTelas()
    return sucesso(`Loja encontrada: ${loja.nome} · ${url}`)
  } catch (e) {
    if (!(e instanceof ErroShopify)) console.error('[influenciadores] endereço da loja', e)
    return falha(e instanceof ErroShopify ? e.message : 'Não foi possível falar com a Shopify. Tente de novo em instantes.')
  }
}
