import 'server-only'

import { FUSO, hojeISO, somarDias, somarMeses } from '@/lib/datas'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database.types'

import { listarPedidos, paraPedidoErp } from './api'
import { ConexaoOlistExpirada, renovarTokens } from './oauth'

/**
 * Sincroniza os pedidos do Olist para a tabela pedidos_erp.
 * Usa a chave secreta (tokens não são legíveis pela equipe), por isso só é
 * chamada pela rota /api/cron/olist — protegida por CRON_SECRET.
 *
 * Cada execução:
 *   1. trava (evita duas sincronizações simultâneas) e renova o token se preciso;
 *   2. busca os pedidos criados nos últimos 62 dias (na 1ª vez, 13 meses de histórico);
 *   3. busca os pedidos alterados desde a última execução (ex.: cancelamentos antigos);
 *   4. grava tudo e remove o que sumiu do Olist dentro da janela consultada.
 */

const JANELA_DIAS = 62
const HISTORICO_MESES = 13
const MARGEM_MINUTOS = 15
const TRAVA_MINUTOS = 10
const LOTE = 500

type Atualizacao = Database['public']['Tables']['integracao_olist']['Update']

export type ResultadoSincronizacao =
  | { ok: true; pedidos: number; removidos: number; completa: boolean }
  | { ok: false; codigo: 'nao_conectado' | 'em_andamento' | 'erro'; motivo: string }

/** "AAAA-MM-DD HH:mm:ss" no horário de Brasília (formato do filtro dataAtualizacao). */
function dataHoraBrasilia(data: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(data)
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00'
  return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}:${v('second')}`
}

export async function sincronizarOlist(): Promise<ResultadoSincronizacao> {
  const supabase = createAdminClient()
  const inicio = new Date().toISOString()
  const travaVencida = new Date(Date.now() - TRAVA_MINUTOS * 60_000).toISOString()

  const { data: conexao, error: erroTrava } = await supabase
    .from('integracao_olist')
    .update({ sincronizando_desde: inicio })
    .eq('id', 1)
    .not('refresh_token', 'is', null)
    .or(`sincronizando_desde.is.null,sincronizando_desde.lt."${travaVencida}"`)
    .select('*')
    .maybeSingle()
  if (erroTrava) return { ok: false, codigo: 'erro', motivo: erroTrava.message }
  if (!conexao?.refresh_token) {
    const { data } = await supabase.from('integracao_olist').select('refresh_token').eq('id', 1).maybeSingle()
    return data?.refresh_token
      ? { ok: false, codigo: 'em_andamento', motivo: 'Já existe uma sincronização em andamento.' }
      : { ok: false, codigo: 'nao_conectado', motivo: 'O Olist não está conectado.' }
  }

  try {
    let accessToken = conexao.access_token
    const expiraEm = conexao.access_expira_em ? new Date(conexao.access_expira_em).getTime() : 0
    if (!accessToken || expiraEm < Date.now() + 5 * 60_000) {
      const tokens = await renovarTokens(conexao.refresh_token)
      accessToken = tokens.accessToken
      const { error } = await supabase
        .from('integracao_olist')
        .update({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          access_expira_em: tokens.accessExpiraEm,
          refresh_expira_em: tokens.refreshExpiraEm,
        })
        .eq('id', 1)
      if (error) throw error
    }

    const hoje = hojeISO()
    const completa = !conexao.sincronizado_ate
    const dataInicial = completa ? `${somarMeses(hoje.slice(0, 7), -HISTORICO_MESES)}-01` : somarDias(hoje, -JANELA_DIAS)
    // dataFinal = amanhã: cobre o dia de hoje mesmo se o filtro da API for exclusivo.
    const porCriacao = await listarPedidos(accessToken, { dataInicial, dataFinal: somarDias(hoje, 1) })
    const porAtualizacao = completa
      ? []
      : await listarPedidos(accessToken, {
          dataAtualizacao: dataHoraBrasilia(new Date(new Date(conexao.sincronizado_ate!).getTime() - MARGEM_MINUTOS * 60_000)),
        })

    const linhas = new Map<number, NonNullable<ReturnType<typeof paraPedidoErp>>>()
    for (const pedido of [...porCriacao, ...porAtualizacao]) {
      const linha = paraPedidoErp(pedido, inicio)
      if (linha) linhas.set(linha.id, linha)
    }
    const lista = [...linhas.values()]
    for (let i = 0; i < lista.length; i += LOTE) {
      const { error } = await supabase.from('pedidos_erp').upsert(lista.slice(i, i + LOTE))
      if (error) throw error
    }

    // Pedidos excluídos no Olist: estavam na janela consultada e não vieram nesta busca.
    const { count: removidos, error: erroRemocao } = await supabase
      .from('pedidos_erp')
      .delete({ count: 'exact' })
      .gte('data_pedido', dataInicial)
      .lte('data_pedido', hoje)
      .lt('sincronizado_em', inicio)
    if (erroRemocao) throw erroRemocao

    await supabase
      .from('integracao_olist')
      .update({ ultima_sincronizacao: new Date().toISOString(), sincronizado_ate: inicio, sincronizando_desde: null, ultimo_erro: null })
      .eq('id', 1)
    return { ok: true, pedidos: lista.length, removidos: removidos ?? 0, completa }
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'Erro desconhecido.'
    const atualizacao: Atualizacao = { sincronizando_desde: null, ultimo_erro: motivo.slice(0, 500) }
    // Refresh vencido/revogado: marca a conexão como expirada (a tela pede para reconectar).
    if (erro instanceof ConexaoOlistExpirada) Object.assign(atualizacao, { access_token: null, refresh_expira_em: new Date().toISOString() })
    await supabase.from('integracao_olist').update(atualizacao).eq('id', 1)
    console.error('[olist] sincronização falhou', erro)
    return { ok: false, codigo: 'erro', motivo }
  }
}
